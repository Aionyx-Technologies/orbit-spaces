from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.db import SessionFactory
from orbit.errors import AiUsesExhausted
from orbit.models import AiUseEntry, BillingAccount, CreditGrant, User, new_id
from orbit.plans import plus_entitlements
from orbit.services import ai_uses, billing_state
from orbit.services.context import Env
from orbit.services.periods import _add_months
from tests.conftest import Factory, FakeClock, Person


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com")


def make_plus(
    db: Session, env: Env, person: Person, period_start: datetime, days: int = 30
) -> None:
    db.add(
        BillingAccount(
            user_id=person.id,
            stripe_customer_id=f"cus_{new_id()}",
            plan="plus",
            status="active",
            period_start=period_start,
            period_end=period_start + timedelta(days=days),
            updated_at=env.now(),
        )
    )
    db.commit()


def give_pack(
    db: Session,
    env: Env,
    person: Person,
    amount: int = 100,
    expires_in: timedelta = timedelta(days=100),
    revoked: bool = False,
) -> CreditGrant:
    grant = CreditGrant(
        id=new_id(),
        user_id=person.id,
        kind="ai",
        amount=amount,
        expires_at=env.now() + expires_in,
        stripe_event_id=f"evt_{new_id()}",
        created_at=env.now(),
        revoked_at=env.now() if revoked else None,
    )
    db.add(grant)
    db.commit()
    return grant


def spend(db: Session, env: Env, person: Person, times: int) -> list[ai_uses.Reservation | None]:
    return [ai_uses.reserve(db, env, person.id, ai_uses.KIND_COMBINE) for _ in range(times)]


def test_plus_gets_150_uses_a_month(db: Session, env: Env, alex: Person) -> None:
    make_plus(db, env, alex, env.now())

    spend(db, env, alex, 150)

    user = db.get(User, alex.id)
    assert user is not None
    result = ai_uses.allowance(db, env, user)
    assert (result.limit, result.used, result.remaining) == (150, 150, 0)
    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)


def test_a_pack_is_spent_after_the_monthly_allowance(db: Session, env: Env, alex: Person) -> None:
    grant = give_pack(db, env, alex)

    reservations = spend(db, env, alex, 120)

    assert [r.grant_id for r in reservations if r][:20] == [None] * 20
    assert {r.grant_id for r in reservations[20:] if r} == {grant.id}
    assert billing_state.grant_remaining(db, grant) == 0
    assert billing_state.pack_credits_left(db, alex.id, "ai", env.now()) == 0
    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)
    user = db.get(User, alex.id)
    assert user is not None
    assert ai_uses.allowance(db, env, user).used == 20


def test_a_failed_use_paid_by_a_pack_goes_back_to_the_pack(
    db: Session, env: Env, alex: Person
) -> None:
    grant = give_pack(db, env, alex)
    spend(db, env, alex, 20)
    reservation = ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)
    assert reservation is not None
    assert billing_state.grant_remaining(db, grant) == 99

    ai_uses.refund(db, env, reservation)
    ai_uses.refund(db, env, reservation)

    assert billing_state.grant_remaining(db, grant) == 100
    user = db.get(User, alex.id)
    assert user is not None
    assert ai_uses.allowance(db, env, user).used == 20


def test_the_earliest_expiring_pack_is_spent_first(db: Session, env: Env, alex: Person) -> None:
    later = give_pack(db, env, alex, expires_in=timedelta(days=300))
    sooner = give_pack(db, env, alex, expires_in=timedelta(days=50))
    spend(db, env, alex, 20)

    reservation = ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    assert reservation is not None
    assert reservation.grant_id == sooner.id
    assert later.id != sooner.id


def test_an_expired_pack_is_not_spent(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    give_pack(db, env, alex, expires_in=timedelta(days=10))
    spend(db, env, alex, 20)

    clock.advance(days=11)

    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)


def test_a_revoked_pack_is_not_spent(db: Session, env: Env, alex: Person) -> None:
    give_pack(db, env, alex, revoked=True)
    spend(db, env, alex, 20)

    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)
    assert billing_state.pack_credits_left(db, alex.id, "ai", env.now()) == 0


def test_two_requests_racing_for_the_last_pack_credit_spend_it_once(
    db: Session, env: Env, session_factory: SessionFactory, alex: Person
) -> None:
    grant = give_pack(db, env, alex, amount=1)
    spend(db, env, alex, 20)

    def attempt() -> bool:
        with session_factory() as session:
            try:
                return ai_uses.reserve(session, env, alex.id, ai_uses.KIND_COMBINE) is not None
            except AiUsesExhausted:
                return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result() for f in [pool.submit(attempt), pool.submit(attempt)]]

    assert sorted(results) == [False, True]
    db.expire_all()
    assert billing_state.grant_remaining(db, grant) == 0
    assert (
        db.scalar(
            select(func.count()).select_from(AiUseEntry).where(AiUseEntry.grant_id == grant.id)
        )
        == 1
    )


def test_a_paid_person_period_follows_the_subscription(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    start = env.now() - timedelta(days=3)
    make_plus(db, env, alex, start, days=30)
    user = db.get(User, alex.id)
    assert user is not None

    assert billing_state.billing_period(db, user, env.settings, env.now()) == (
        start,
        start + timedelta(days=30),
    )
    assert ai_uses.allowance(db, env, user).resets_at == start + timedelta(days=30)
    assert billing_state.entitlements_for(db, env.settings, alex.id, env.now()).plan == "plus"


def test_a_free_person_period_follows_signup(db: Session, env: Env, alex: Person) -> None:
    user = db.get(User, alex.id)
    assert user is not None

    assert billing_state.billing_period(db, user, env.settings, env.now()) == (
        ai_uses.period_bounds(user.created_at, env.now())
    )
    assert billing_state.entitlements_for(db, env.settings, alex.id, env.now()).plan == "free"


def test_an_unmetered_server_leaves_no_transaction_open(
    db: Session, settings: Settings, clock: FakeClock, alex: Person
) -> None:
    open_env = Env(settings=settings.model_copy(update={"free_ai_uses": 0}), clock=clock)

    assert ai_uses.reserve(db, open_env, alex.id, ai_uses.KIND_COMBINE) is None

    assert not db.in_transaction()


def test_an_unlimited_person_with_a_billing_account_leaves_no_transaction_open(
    db: Session, env: Env, alex: Person, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_plus(db, env, alex, env.now())
    unlimited = replace(plus_entitlements(), ai_uses_per_month=None)
    monkeypatch.setattr(billing_state, "entitlements_for", lambda *args, **kwargs: unlimited)

    assert ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE) is None

    assert not db.in_transaction()


def test_an_exhausted_refusal_leaves_no_transaction_open(
    db: Session, env: Env, alex: Person
) -> None:
    spend(db, env, alex, 20)

    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    assert not db.in_transaction()


def test_a_successful_reserve_leaves_no_transaction_open(
    db: Session, env: Env, alex: Person
) -> None:
    give_pack(db, env, alex)
    spend(db, env, alex, 21)

    assert not db.in_transaction()


def test_yearly_plus_gets_a_fresh_150_each_month(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    start = env.now()
    make_plus(db, env, alex, start, days=365)
    spend(db, env, alex, 150)
    with pytest.raises(AiUsesExhausted):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    clock.advance(days=40)
    user = db.get(User, alex.id)
    assert user is not None
    month_start, month_end = ai_uses.period_bounds(start, env.now())
    result = ai_uses.allowance(db, env, user)

    assert (result.limit, result.used) == (150, 0)
    assert result.resets_at == month_end
    assert month_start > start
    assert month_start <= env.now() < result.resets_at
    assert timedelta(days=28) <= result.resets_at - month_start <= timedelta(days=31)
    assert ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE) is not None
    db.expire_all()
    assert ai_uses.allowance(db, env, user).used == 1


def test_a_yearly_month_never_runs_past_the_subscription_end(
    db: Session, env: Env, alex: Person
) -> None:
    start = env.now() - timedelta(days=350)
    make_plus(db, env, alex, start, days=365)
    user = db.get(User, alex.id)
    assert user is not None

    assert ai_uses.allowance(db, env, user).resets_at == start + timedelta(days=365)


def test_a_refund_inside_a_yearly_month_gives_the_use_back(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    make_plus(db, env, alex, env.now(), days=365)
    clock.advance(days=70)
    spend(db, env, alex, 3)
    reservation = ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)
    assert reservation is not None

    ai_uses.refund(db, env, reservation)

    user = db.get(User, alex.id)
    assert user is not None
    assert ai_uses.allowance(db, env, user).used == 3


def test_a_monthly_subscription_keeps_the_stripe_period(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    start = env.now() - timedelta(days=2)
    make_plus(db, env, alex, start, days=31)
    spend(db, env, alex, 5)
    user = db.get(User, alex.id)
    assert user is not None

    assert billing_state.billing_period(db, user, env.settings, env.now()) == (
        start,
        start + timedelta(days=31),
    )
    assert ai_uses.allowance(db, env, user).used == 5


def test_a_late_renewal_never_shows_a_reset_date_in_the_past(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    end = env.now() + timedelta(hours=1)
    start = _add_months(end, -1)
    make_plus(db, env, alex, start, days=(end - start).days)
    spend(db, env, alex, 150)

    clock.advance(hours=2)
    user = db.get(User, alex.id)
    assert user is not None
    result = ai_uses.allowance(db, env, user)

    assert result.resets_at > env.now()
    assert result.used == 0
    assert ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE) is not None


def test_refunding_a_monthly_use_while_a_pack_exists_goes_back_to_the_month(
    db: Session, env: Env, alex: Person
) -> None:
    grant = give_pack(db, env, alex)
    reservations = spend(db, env, alex, 20)
    last = reservations[-1]
    assert last is not None
    assert last.grant_id is None

    ai_uses.refund(db, env, last)

    user = db.get(User, alex.id)
    assert user is not None
    assert ai_uses.allowance(db, env, user).used == 19
    following = ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)
    assert following is not None
    assert following.grant_id is None
    assert billing_state.grant_remaining(db, grant) == 100


@pytest.mark.parametrize(
    ("free_ai", "free_email", "plus_ai", "plus_email"),
    [
        (0, 0, None, None),
        (0, 5, None, 100),
        (20, 0, 150, None),
        (20, 5, 150, 100),
    ],
)
def test_plus_is_never_limited_where_free_is_not(
    db: Session,
    settings: Settings,
    clock: FakeClock,
    alex: Person,
    free_ai: int,
    free_email: int,
    plus_ai: int | None,
    plus_email: int | None,
) -> None:
    open_env = Env(
        settings=settings.model_copy(
            update={"free_ai_uses": free_ai, "max_update_emails_per_day": free_email}
        ),
        clock=clock,
    )
    make_plus(db, open_env, alex, open_env.now())

    plus = billing_state.entitlements_for(db, open_env.settings, alex.id, open_env.now())

    assert plus.plan == "plus"
    assert (plus.ai_uses_per_month, plus.instant_emails_per_day) == (plus_ai, plus_email)
    assert plus.members_per_space == 25


def test_a_plus_person_on_a_server_without_a_free_ai_limit_is_not_metered(
    db: Session, settings: Settings, clock: FakeClock, alex: Person
) -> None:
    open_env = Env(settings=settings.model_copy(update={"free_ai_uses": 0}), clock=clock)
    make_plus(db, open_env, alex, open_env.now())

    assert ai_uses.reserve(db, open_env, alex.id, ai_uses.KIND_COMBINE) is None
    assert not db.in_transaction()
