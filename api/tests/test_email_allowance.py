from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.db import SessionFactory, session_scope
from orbit.models import BillingAccount, CreditGrant, EmailSend, new_id
from orbit.services import billing_state, email_allowance
from orbit.services.context import Env
from tests.conftest import Factory, FakeClock, Person


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com")


@pytest.fixture(autouse=True)
def free_cap(env: Env) -> None:
    env.settings.max_update_emails_per_day = 5


def send(db: Session, env: Env, person: Person) -> bool:
    ok = email_allowance.try_send(db, env.settings, person.id, env.now())
    db.commit()
    return ok


def count(db: Session) -> int:
    return int(db.scalar(select(func.count()).select_from(EmailSend)) or 0)


def test_sends_under_the_free_cap_are_recorded(db: Session, env: Env, alex: Person) -> None:
    assert [send(db, env, alex) for _ in range(5)] == [True] * 5

    assert count(db) == 5
    assert db.scalar(select(func.count()).where(EmailSend.grant_id.is_not(None))) == 0


def test_the_sixth_free_send_in_a_day_is_refused(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    for _ in range(5):
        send(db, env, alex)

    assert send(db, env, alex) is False
    assert count(db) == 5
    clock.advance(hours=25)
    assert send(db, env, alex) is True


def test_a_plus_person_gets_100_a_day(db: Session, env: Env, alex: Person) -> None:
    db.add(
        BillingAccount(
            user_id=alex.id,
            stripe_customer_id="cus_1",
            plan="plus",
            status="active",
            period_start=env.now(),
            period_end=env.now() + timedelta(days=30),
            updated_at=env.now(),
        )
    )
    db.commit()

    results = [send(db, env, alex) for _ in range(101)]

    assert results == [True] * 100 + [False]


def pack(db: Session, env: Env, alex: Person, amount: int) -> CreditGrant:
    grant = CreditGrant(
        id=new_id(),
        user_id=alex.id,
        kind="email",
        amount=amount,
        expires_at=env.now() + timedelta(days=100),
        stripe_event_id=f"evt_{new_id()}",
        created_at=env.now(),
    )
    db.add(grant)
    db.commit()
    return grant


def test_an_email_pack_pays_for_sends_past_the_cap(db: Session, env: Env, alex: Person) -> None:
    grant = pack(db, env, alex, 2)
    for _ in range(5):
        send(db, env, alex)
    assert email_allowance.used_the_last_allowance(db, env.settings, alex.id, env.now()) is False
    db.rollback()

    assert [send(db, env, alex) for _ in range(3)] == [True, True, False]

    paid = db.scalar(select(func.count()).where(EmailSend.grant_id == grant.id))
    assert paid == 2
    assert email_allowance.used_the_last_allowance(db, env.settings, alex.id, env.now()) is True


def test_counts_survive_a_new_session(
    db: Session, session_factory: SessionFactory, env: Env, alex: Person
) -> None:
    for _ in range(5):
        send(db, env, alex)

    with session_scope(session_factory) as other:
        assert email_allowance.try_send(other, env.settings, alex.id, env.now()) is False


def test_prune_removes_old_rows(db: Session, env: Env, clock: FakeClock, alex: Person) -> None:
    send(db, env, alex)
    clock.advance(days=3)
    send(db, env, alex)

    assert email_allowance.prune(db, env.now()) == 1
    db.commit()
    assert count(db) == 1


def test_prune_keeps_pack_paid_sends_so_credit_is_not_refunded(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    grant = pack(db, env, alex, 3)
    for _ in range(5):
        send(db, env, alex)
    send(db, env, alex)
    left = billing_state.pack_credits_left(db, alex.id, "email", env.now())
    assert left == 2

    clock.advance(days=3)
    email_allowance.prune(db, env.now())
    db.commit()

    assert billing_state.pack_credits_left(db, alex.id, "email", env.now()) == left
    assert db.scalar(select(func.count()).where(EmailSend.grant_id == grant.id)) == 1


def test_usage_is_none_without_a_daily_cap(db: Session, env: Env, alex: Person) -> None:
    env.settings.max_update_emails_per_day = 0

    assert email_allowance.usage(db, env.settings, alex.id, env.now()) is None


def test_usage_counts_only_plan_paid_sends_in_the_last_day(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    send(db, env, alex)
    clock.advance(hours=25)
    for _ in range(3):
        send(db, env, alex)
    grant = pack(db, env, alex, 1)
    send(db, env, alex)
    send(db, env, alex)
    db.add(EmailSend(id=new_id(), user_id=alex.id, sent_at=env.now(), grant_id=grant.id))
    db.commit()

    usage = email_allowance.usage(db, env.settings, alex.id, env.now())

    assert usage == email_allowance.EmailUsage(limit=5, used=5, remaining=0)


def test_usage_remaining_never_goes_below_zero(db: Session, env: Env, alex: Person) -> None:
    for _ in range(5):
        send(db, env, alex)
    env.settings.max_update_emails_per_day = 3

    usage = email_allowance.usage(db, env.settings, alex.id, env.now())

    assert usage == email_allowance.EmailUsage(limit=3, used=5, remaining=0)


def test_a_plus_person_sees_the_plus_limit(db: Session, env: Env, alex: Person) -> None:
    db.add(
        BillingAccount(
            user_id=alex.id,
            stripe_customer_id="cus_1",
            plan="plus",
            status="active",
            period_start=env.now(),
            period_end=env.now() + timedelta(days=30),
            updated_at=env.now(),
        )
    )
    db.commit()
    for _ in range(2):
        send(db, env, alex)

    usage = email_allowance.usage(db, env.settings, alex.id, env.now())

    assert usage == email_allowance.EmailUsage(limit=100, used=2, remaining=98)
