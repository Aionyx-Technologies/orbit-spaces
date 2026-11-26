from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.db import SessionFactory
from orbit.models import AiUseEntry, BillingAccount, CreditGrant, StripeEvent
from orbit.plans import AI_PACK_USES, EMAIL_PACK_CREDITS, GRANT_TTL
from orbit.services.billing_events import handle_event
from orbit.services.billing_state import grant_remaining, pack_credits_left, spendable_grant
from tests.conftest import Factory, Person

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
PERIOD_START = 1_795_000_000
PERIOD_END = PERIOD_START + 30 * 86400


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com")


def event(type: str, obj: dict[str, Any], id: str = "evt_1") -> dict[str, Any]:
    return {"id": id, "type": type, "created": 1_795_000_000, "data": {"object": obj}}


def pack_session(user_id: str, product: str = "ai_pack", **extra: Any) -> dict[str, Any]:
    session: dict[str, Any] = {
        "id": "cs_1",
        "mode": "payment",
        "payment_status": "paid",
        "client_reference_id": user_id,
        "payment_intent": "pi_1",
        "customer": "cus_1",
        "metadata": {"user_id": user_id, "product": product},
    }
    session.update(extra)
    return session


def subscription(customer: str = "cus_1", **extra: Any) -> dict[str, Any]:
    sub: dict[str, Any] = {
        "id": "sub_1",
        "customer": customer,
        "status": "active",
        "cancel_at_period_end": False,
        "current_period_start": PERIOD_START,
        "current_period_end": PERIOD_END,
    }
    sub.update(extra)
    return sub


def grants(db: Session) -> list[CreditGrant]:
    return list(db.scalars(select(CreditGrant)))


def add_account(db: Session, user_id: str, customer: str = "cus_1") -> None:
    db.add(BillingAccount(user_id=user_id, stripe_customer_id=customer, updated_at=NOW))
    db.commit()


def test_a_paid_ai_pack_creates_one_grant(db: Session, settings: Settings, alex: Person) -> None:
    changed = handle_event(
        db, settings, event("checkout.session.completed", pack_session(alex.id)), NOW
    )

    assert changed is True
    (grant,) = grants(db)
    assert (grant.user_id, grant.kind, grant.amount) == (alex.id, "ai", AI_PACK_USES)
    assert grant.stripe_event_id == "evt_1"
    assert grant.stripe_payment_intent == "pi_1"
    assert grant.expires_at.replace(tzinfo=UTC) == NOW + GRANT_TTL


def test_a_paid_email_pack_grants_email_credits(
    db: Session, settings: Settings, alex: Person
) -> None:
    obj = pack_session(alex.id, "email_pack")
    handle_event(db, settings, event("checkout.session.completed", obj), NOW)

    (grant,) = grants(db)
    assert (grant.kind, grant.amount) == ("email", EMAIL_PACK_CREDITS)


def test_the_same_event_twice_creates_one_grant(
    db: Session, settings: Settings, alex: Person
) -> None:
    body = event("checkout.session.completed", pack_session(alex.id))

    assert handle_event(db, settings, body, NOW) is True
    assert handle_event(db, settings, body, NOW) is False

    assert len(grants(db)) == 1
    assert db.scalar(select(func.count()).select_from(StripeEvent)) == 1


def test_two_racing_deliveries_create_one_grant(
    db: Session,
    settings: Settings,
    session_factory: SessionFactory,
    alex: Person,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = event("checkout.session.completed", pack_session(alex.id))
    loser = session_factory()
    # The loser looked a moment too early: its read says the event is new.
    real_get = loser.get
    monkeypatch.setattr(
        loser,
        "get",
        lambda entity, ident, *a, **k: (
            None if entity is StripeEvent else real_get(entity, ident, *a, **k)
        ),
    )

    assert handle_event(db, settings, body, NOW) is True
    assert handle_event(loser, settings, body, NOW) is False
    loser.close()

    assert len(grants(db)) == 1


def test_a_failure_rolls_the_event_back_so_the_retry_runs(
    db: Session, settings: Settings, alex: Person, monkeypatch: pytest.MonkeyPatch
) -> None:
    from orbit.services import billing_events

    body = event("checkout.session.completed", pack_session(alex.id))

    def boom(*args: Any) -> bool:
        raise RuntimeError("boom")

    monkeypatch.setitem(billing_events._HANDLERS, "checkout.session.completed", boom)
    with pytest.raises(RuntimeError):
        handle_event(db, settings, body, NOW)
    assert db.get(StripeEvent, "evt_1") is None
    monkeypatch.undo()

    assert handle_event(db, settings, body, NOW) is True


def test_an_unpaid_or_subscription_session_creates_no_grant(
    db: Session, settings: Settings, alex: Person
) -> None:
    unpaid = pack_session(alex.id, payment_status="unpaid")
    sub_mode = pack_session(alex.id, mode="subscription")

    assert (
        handle_event(db, settings, event("checkout.session.completed", unpaid, "e1"), NOW) is False
    )
    handle_event(db, settings, event("checkout.session.completed", sub_mode, "e2"), NOW)

    assert grants(db) == []


def test_a_checkout_with_a_bad_user_or_product_creates_no_grant(
    db: Session, settings: Settings, alex: Person
) -> None:
    bodies = [
        pack_session("no-such-user"),
        pack_session(alex.id, client_reference_id="someone-else"),
        pack_session(alex.id, "gold_pack"),
    ]
    for index, obj in enumerate(bodies):
        body = event("checkout.session.completed", obj, f"e{index}")
        assert handle_event(db, settings, body, NOW) is False

    assert grants(db) == []
    assert db.scalar(select(func.count()).select_from(StripeEvent)) == 3


def test_a_subscription_checkout_only_records_the_customer(
    db: Session, settings: Settings, alex: Person
) -> None:
    obj = pack_session(alex.id, mode="subscription", payment_status="paid")
    assert handle_event(db, settings, event("checkout.session.completed", obj), NOW) is True

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert (account.stripe_customer_id, account.plan) == ("cus_1", "free")


def test_a_subscription_checkout_moves_a_free_account_to_the_customer_that_paid(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id, "cus_old")
    obj = pack_session(alex.id, mode="subscription", customer="cus_new")

    assert handle_event(db, settings, event("checkout.session.completed", obj), NOW) is True

    assert stored(db, alex.id).stripe_customer_id == "cus_new"


def test_a_subscription_checkout_never_moves_a_paid_account(
    db: Session, settings: Settings, alex: Person, caplog: pytest.LogCaptureFixture
) -> None:
    add_account(db, alex.id, "cus_old")
    handle_event(
        db,
        settings,
        sub_event("customer.subscription.updated", subscription("cus_old"), "e1", 1000),
        NOW,
    )
    obj = pack_session(alex.id, mode="subscription", customer="cus_new")

    with caplog.at_level(logging.WARNING):
        assert (
            handle_event(db, settings, event("checkout.session.completed", obj, "e2"), NOW) is False
        )

    assert stored(db, alex.id).stripe_customer_id == "cus_old"
    assert "cus_new" not in caplog.text


def test_a_subscription_checkout_never_takes_another_persons_customer(
    db: Session, settings: Settings, alex: Person, make: Factory
) -> None:
    blake = make.user("blake@example.com")
    add_account(db, alex.id, "cus_old")
    add_account(db, blake.id, "cus_blake")
    obj = pack_session(alex.id, mode="subscription", customer="cus_blake")

    assert handle_event(db, settings, event("checkout.session.completed", obj), NOW) is False

    assert stored(db, alex.id).stripe_customer_id == "cus_old"
    assert stored(db, blake.id).stripe_customer_id == "cus_blake"


def test_a_subscription_update_makes_a_person_plus_with_period_dates(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    body = event("customer.subscription.updated", subscription(cancel_at_period_end=True))

    assert handle_event(db, settings, body, NOW) is True

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert (account.plan, account.status, account.cancel_at_period_end) == ("plus", "active", True)
    assert account.period_start is not None
    assert account.period_start.replace(tzinfo=UTC) == datetime.fromtimestamp(PERIOD_START, UTC)
    assert account.period_end is not None
    assert account.period_end.replace(tzinfo=UTC) == datetime.fromtimestamp(PERIOD_END, UTC)


def test_period_dates_come_from_the_first_item_on_newer_api_versions(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    sub = subscription()
    del sub["current_period_start"], sub["current_period_end"]
    sub["items"] = {
        "data": [{"current_period_start": PERIOD_START, "current_period_end": PERIOD_END}]
    }

    handle_event(db, settings, event("customer.subscription.created", sub), NOW)

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert account.period_end is not None
    assert account.period_end.replace(tzinfo=UTC) == datetime.fromtimestamp(PERIOD_END, UTC)


def test_an_unpaid_subscription_status_is_not_plus(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    body = event("customer.subscription.updated", subscription(status="unpaid"))

    handle_event(db, settings, body, NOW)

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert (account.plan, account.status) == ("free", "unpaid")


def test_a_subscription_for_an_unknown_customer_is_ignored(
    db: Session, settings: Settings, alex: Person
) -> None:
    body = event("customer.subscription.updated", subscription("cus_stranger"))

    assert handle_event(db, settings, body, NOW) is False

    assert db.scalar(select(func.count()).select_from(BillingAccount)) == 0
    assert db.get(StripeEvent, "evt_1") is not None


def test_a_canceled_subscription_drops_to_free(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    handle_event(db, settings, event("customer.subscription.updated", subscription(), "e1"), NOW)

    gone = event("customer.subscription.deleted", subscription(status="canceled"), "e2")
    assert handle_event(db, settings, gone, NOW) is True

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert (account.plan, account.status) == ("free", "canceled")


def spend_ai(db: Session, user_id: str, grant: CreditGrant, uses: int) -> None:
    for _ in range(uses):
        db.add(
            AiUseEntry(
                user_id=user_id,
                kind="combine",
                delta=1,
                period_start=NOW,
                created_at=NOW,
                grant_id=grant.id,
            )
        )
    db.commit()


def test_a_refund_revokes_the_unspent_credits_only(
    db: Session, settings: Settings, alex: Person
) -> None:
    handle_event(db, settings, event("checkout.session.completed", pack_session(alex.id)), NOW)
    (grant,) = grants(db)
    spend_ai(db, alex.id, grant, 30)

    refund = event(
        "charge.refunded",
        {"payment_intent": "pi_1", "amount": 500, "amount_refunded": 500, "refunded": True},
        "e2",
    )
    assert handle_event(db, settings, refund, NOW + timedelta(days=1)) is True

    db.refresh(grant)
    assert grant.revoked_at is not None
    assert grant_remaining(db, grant) == AI_PACK_USES - 30
    assert db.scalar(select(func.count()).select_from(AiUseEntry)) == 30
    assert spendable_grant(db, alex.id, "ai", NOW) is None
    assert pack_credits_left(db, alex.id, "ai", NOW) == 0


def test_a_partial_refund_keeps_the_credits(db: Session, settings: Settings, alex: Person) -> None:
    handle_event(db, settings, event("checkout.session.completed", pack_session(alex.id)), NOW)
    refund = event(
        "charge.refunded",
        {"payment_intent": "pi_1", "amount": 500, "amount_refunded": 100, "refunded": False},
        "e2",
    )

    assert handle_event(db, settings, refund, NOW) is False

    (grant,) = grants(db)
    assert grant.revoked_at is None


def test_an_unknown_event_type_is_recorded_and_ignored(db: Session, settings: Settings) -> None:
    assert handle_event(db, settings, event("payout.paid", {}), NOW) is False
    assert db.get(StripeEvent, "evt_1") is not None


def test_a_failed_payment_changes_nothing(db: Session, settings: Settings, alex: Person) -> None:
    add_account(db, alex.id)
    body = event("invoice.payment_failed", {"customer": "cus_1", "customer_email": "a@b.c"})

    assert handle_event(db, settings, body, NOW) is False

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert account.plan == "free"


def sub_event(type: str, sub: dict[str, Any], id: str, created: int | None) -> dict[str, Any]:
    body = event(type, sub, id)
    if created is None:
        del body["created"]
    else:
        body["created"] = created
    return body


def stored(db: Session, user_id: str) -> BillingAccount:
    db.expire_all()
    account = db.get(BillingAccount, user_id)
    assert account is not None
    return account


def test_a_duplicate_event_leaves_no_transaction_open(
    db: Session, settings: Settings, alex: Person
) -> None:
    body = event("payout.paid", {})
    handle_event(db, settings, body, NOW)

    assert handle_event(db, settings, body, NOW) is False

    assert not db.in_transaction()


def test_a_late_older_subscription_event_is_ignored(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    new = sub_event("customer.subscription.updated", subscription(), "e1", 2000)
    old = sub_event("customer.subscription.updated", subscription(status="canceled"), "e2", 1000)

    assert handle_event(db, settings, new, NOW) is True
    assert handle_event(db, settings, old, NOW) is False

    assert (stored(db, alex.id).plan, stored(db, alex.id).status) == ("plus", "active")
    assert db.get(StripeEvent, "e2") is not None


def test_an_incomplete_created_after_active_in_the_same_second_does_not_regress(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    active = sub_event("customer.subscription.updated", subscription(), "e1", 2000)
    first = sub_event(
        "customer.subscription.created", subscription(status="incomplete"), "e2", 2000
    )

    handle_event(db, settings, active, NOW)
    assert handle_event(db, settings, first, NOW) is False

    assert stored(db, alex.id).plan == "plus"


def test_a_deleted_for_an_old_subscription_does_not_drop_a_newer_one(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    handle_event(
        db,
        settings,
        sub_event("customer.subscription.updated", subscription(id="sub_new"), "e1", 1000),
        NOW,
    )

    gone = sub_event("customer.subscription.deleted", subscription(id="sub_old"), "e2", 2000)
    assert handle_event(db, settings, gone, NOW) is False

    account = stored(db, alex.id)
    assert (account.plan, account.stripe_subscription_id) == ("plus", "sub_new")


def test_a_paid_new_subscription_replaces_a_stored_one_that_is_not_paid(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    handle_event(
        db,
        settings,
        sub_event(
            "customer.subscription.updated", subscription(id="sub_1", status="unpaid"), "e1", 1000
        ),
        NOW,
    )
    incomplete = subscription(id="sub_2", status="incomplete")
    handle_event(
        db, settings, sub_event("customer.subscription.created", incomplete, "e2", 1500), NOW
    )
    assert stored(db, alex.id).stripe_subscription_id == "sub_1"

    paid = sub_event("customer.subscription.created", subscription(id="sub_2"), "e3", 2000)
    assert handle_event(db, settings, paid, NOW) is True

    account = stored(db, alex.id)
    assert (account.plan, account.stripe_subscription_id) == ("plus", "sub_2")


def test_a_second_paid_subscription_never_replaces_a_paid_one(
    db: Session, settings: Settings, alex: Person, caplog: pytest.LogCaptureFixture
) -> None:
    add_account(db, alex.id)
    handle_event(
        db,
        settings,
        sub_event("customer.subscription.created", subscription(id="sub_1"), "e1", 1000),
        NOW,
    )

    with caplog.at_level(logging.ERROR):
        duplicate = sub_event("customer.subscription.created", subscription(id="sub_2"), "e2", 2000)
        assert handle_event(db, settings, duplicate, NOW) is False
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "sub_2" not in caplog.text
    assert "cus_1" not in caplog.text

    gone = sub_event("customer.subscription.deleted", subscription(id="sub_2"), "e3", 3000)
    assert handle_event(db, settings, gone, NOW) is False
    account = stored(db, alex.id)
    assert (account.plan, account.status, account.stripe_subscription_id) == (
        "plus",
        "active",
        "sub_1",
    )


def test_an_update_without_period_dates_keeps_the_stored_ones(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    handle_event(
        db, settings, sub_event("customer.subscription.updated", subscription(), "e1", 1000), NOW
    )
    bare = subscription()
    del bare["current_period_start"], bare["current_period_end"]

    handle_event(db, settings, sub_event("customer.subscription.updated", bare, "e2", 2000), NOW)

    account = stored(db, alex.id)
    assert account.period_end is not None
    assert account.period_end.replace(tzinfo=UTC) == datetime.fromtimestamp(PERIOD_END, UTC)


def test_an_event_without_a_created_time_applies_but_does_not_move_the_clock(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    handle_event(
        db, settings, sub_event("customer.subscription.updated", subscription(), "e1", 1000), NOW
    )

    handle_event(
        db,
        settings,
        sub_event("customer.subscription.updated", subscription(status="past_due"), "e2", None),
        NOW,
    )

    account = stored(db, alex.id)
    assert account.status == "past_due"
    assert account.last_event_at is not None
    assert account.last_event_at.replace(tzinfo=UTC) == datetime.fromtimestamp(1000, UTC)


def test_a_subscription_created_for_an_unknown_customer_recovers_the_account(
    db: Session, settings: Settings, alex: Person
) -> None:
    sub = subscription("cus_lost", metadata={"user_id": alex.id})

    assert handle_event(db, settings, event("customer.subscription.created", sub), NOW) is True

    account = stored(db, alex.id)
    assert (account.stripe_customer_id, account.plan) == ("cus_lost", "plus")


def test_an_unknown_customer_subscription_without_a_usable_user_is_ignored(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id, "cus_old")
    bodies = [
        subscription("cus_b", metadata={"user_id": "nobody"}),
        subscription("cus_c"),
    ]
    for index, sub in enumerate(bodies):
        assert (
            handle_event(
                db, settings, event("customer.subscription.created", sub, f"e{index}"), NOW
            )
            is False
        )

    assert stored(db, alex.id).stripe_customer_id == "cus_old"
    assert db.scalar(select(func.count()).select_from(BillingAccount)) == 1


def test_twin_checkouts_end_on_plus_when_the_losing_customer_pays(
    db: Session, settings: Settings, alex: Person
) -> None:
    # Two checkouts made customers A and B; the route stored A, the person paid on B.
    add_account(db, alex.id, "cus_a")
    sub = subscription("cus_b", id="sub_b", metadata={"user_id": alex.id})

    assert handle_event(db, settings, event("customer.subscription.created", sub), NOW) is True

    account = stored(db, alex.id)
    assert (account.stripe_customer_id, account.plan, account.stripe_subscription_id) == (
        "cus_b",
        "plus",
        "sub_b",
    )


def test_a_subscription_on_another_customer_never_moves_a_paid_account(
    db: Session, settings: Settings, alex: Person, caplog: pytest.LogCaptureFixture
) -> None:
    add_account(db, alex.id, "cus_a")
    handle_event(
        db,
        settings,
        sub_event("customer.subscription.created", subscription("cus_a"), "e1", 1000),
        NOW,
    )
    other = subscription("cus_b", id="sub_b", metadata={"user_id": alex.id})

    with caplog.at_level(logging.WARNING):
        body = sub_event("customer.subscription.created", other, "e2", 2000)
        assert handle_event(db, settings, body, NOW) is False

    account = stored(db, alex.id)
    assert (account.stripe_customer_id, account.stripe_subscription_id) == ("cus_a", "sub_1")
    assert db.scalar(select(func.count()).select_from(BillingAccount)) == 1
    assert "cus_b" not in caplog.text


def test_a_deleted_subscription_on_another_customer_never_moves_an_account(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id, "cus_a")
    gone = subscription("cus_b", id="sub_b", status="canceled", metadata={"user_id": alex.id})

    assert handle_event(db, settings, event("customer.subscription.deleted", gone), NOW) is False

    assert stored(db, alex.id).stripe_customer_id == "cus_a"


def test_a_subscription_set_to_end_through_cancel_at_is_marked_as_ending(
    db: Session, settings: Settings, alex: Person
) -> None:
    # Newer Stripe subscriptions (flexible billing mode) report a cancellation at the end of the
    # period through cancel_at and leave the older cancel_at_period_end flag false.
    add_account(db, alex.id)
    body = event(
        "customer.subscription.updated",
        subscription(cancel_at_period_end=False, cancel_at=PERIOD_END),
    )

    assert handle_event(db, settings, body, NOW) is True

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert (account.plan, account.status, account.cancel_at_period_end) == ("plus", "active", True)


def test_reactivating_a_subscription_clears_the_ending_mark(
    db: Session, settings: Settings, alex: Person
) -> None:
    add_account(db, alex.id)
    ending = subscription(cancel_at_period_end=False, cancel_at=PERIOD_END)
    kept = subscription(cancel_at_period_end=False, cancel_at=None)
    handle_event(
        db, settings, sub_event("customer.subscription.updated", ending, "evt_a", 100), NOW
    )
    assert stored(db, alex.id).cancel_at_period_end is True

    handle_event(db, settings, sub_event("customer.subscription.updated", kept, "evt_b", 200), NOW)

    account = db.get(BillingAccount, alex.id)
    assert account is not None
    assert account.cancel_at_period_end is False
