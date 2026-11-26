"""Stripe webhook events: who bought a pack, and who is on a paid plan.

Each event is handled at most once and in a single transaction. The `StripeEvent` row goes in
first, so a redelivery (or a racing twin) finds it and stops; everything else commits together
with it at the end, so a failure leaves no trace and the Stripe retry starts over.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.models import BillingAccount, CreditGrant, StripeEvent, User
from orbit.plans import (
    AI_PACK_USES,
    EMAIL_PACK_CREDITS,
    GRANT_TTL,
    PLAN_FREE,
    PLAN_PLUS,
    plan_is_paid,
)
from orbit.services.billing_state import KIND_AI, KIND_EMAIL

log = logging.getLogger(__name__)

# What each pack product grants: (kind, amount).
_PACKS = {
    "ai_pack": (KIND_AI, AI_PACK_USES),
    "email_pack": (KIND_EMAIL, EMAIL_PACK_CREDITS),
}


def handle_event(db: Session, settings: Settings, event: dict[str, Any], now: datetime) -> bool:
    """Apply one verified Stripe event. True when it changed something."""
    event_id = str(event["id"])
    event_type = str(event.get("type", ""))
    if db.get(StripeEvent, event_id) is not None:
        db.rollback()
        return False
    try:
        db.add(StripeEvent(id=event_id, type=event_type[:64], received_at=now))
        db.flush()
    except IntegrityError:
        db.rollback()
        return False
    try:
        handler = _HANDLERS.get(event_type)
        changed = handler(db, event, now) if handler is not None else False
        db.commit()
    except BaseException:
        db.rollback()
        raise
    return changed


def _object(event: dict[str, Any]) -> dict[str, Any]:
    obj = event.get("data", {}).get("object")
    return obj if isinstance(obj, dict) else {}


def _checkout_user_id(event: dict[str, Any], session: dict[str, Any]) -> str | None:
    """The Orbit user a checkout belongs to; None unless both places agree."""
    metadata = session.get("metadata") or {}
    ids = {
        value
        for value in (session.get("client_reference_id"), metadata.get("user_id"))
        if isinstance(value, str) and value
    }
    if len(ids) != 1:
        log.warning("Stripe event %s: checkout names no user or two different users", event["id"])
        return None
    return next(iter(ids))


def _checkout_completed(db: Session, event: dict[str, Any], now: datetime) -> bool:
    session = _object(event)
    mode = session.get("mode")
    if mode == "payment":
        return _grant_pack(db, event, session, now)
    if mode == "subscription":
        return _remember_customer(db, event, session, now)
    return False


def _grant_pack(db: Session, event: dict[str, Any], session: dict[str, Any], now: datetime) -> bool:
    if session.get("payment_status") != "paid":
        return False
    user_id = _checkout_user_id(event, session)
    if user_id is None:
        return False
    if db.get(User, user_id) is None:
        log.warning("Stripe event %s: checkout for an unknown user", event["id"])
        return False
    product = (session.get("metadata") or {}).get("product")
    pack = _PACKS.get(product) if isinstance(product, str) else None
    if pack is None:
        log.warning("Stripe event %s: checkout for an unknown product", event["id"])
        return False
    kind, amount = pack
    intent = session.get("payment_intent")
    db.add(
        CreditGrant(
            user_id=user_id,
            kind=kind,
            amount=amount,
            expires_at=now + GRANT_TTL,
            stripe_event_id=event["id"],
            stripe_payment_intent=intent if isinstance(intent, str) and intent else None,
            created_at=now,
        )
    )
    return True


def _remember_customer(
    db: Session, event: dict[str, Any], session: dict[str, Any], now: datetime
) -> bool:
    """A subscription checkout only records the Stripe customer; the plan comes later.

    When the person already has an account on another customer (twin checkouts made two), the
    account moves to the customer that paid, unless it is on a paid plan.
    """
    customer = session.get("customer")
    if not isinstance(customer, str) or not customer:
        return False
    user_id = _checkout_user_id(event, session)
    if user_id is None or db.get(User, user_id) is None:
        log.warning("Stripe event %s: subscription checkout for no known user", event["id"])
        return False
    account = db.get(BillingAccount, user_id)
    if account is not None:
        if account.stripe_customer_id == customer:
            return False
        return _move_to_customer(db, event, account, customer, now)
    if _customer_taken(db, event, customer):
        return False
    db.add(
        BillingAccount(
            user_id=user_id,
            stripe_customer_id=customer,
            plan=PLAN_FREE,
            status="",
            cancel_at_period_end=False,
            updated_at=now,
        )
    )
    return True


def _customer_taken(db: Session, event: dict[str, Any], customer: str) -> bool:
    taken = db.scalar(select(BillingAccount).where(BillingAccount.stripe_customer_id == customer))
    if taken is not None:
        log.warning("Stripe event %s: customer already belongs to another user", event["id"])
        return True
    return False


def _move_to_customer(
    db: Session, event: dict[str, Any], account: BillingAccount, customer: str, now: datetime
) -> bool:
    """Point a person's account at the customer Stripe says they paid on.

    Twin first checkouts can make two customers; the route keeps the first, and the person may
    pay on the second. The verified signature vouches for the event's user id. An account on a
    paid plan never moves: its subscription lives on the stored customer.
    """
    if plan_is_paid(account.plan, account.status):
        log.warning("Stripe event %s: a paid account named another customer", event["id"])
        return False
    if _customer_taken(db, event, customer):
        return False
    account.stripe_customer_id = customer
    account.updated_at = now
    db.flush()
    return True


def _account_for(db: Session, subscription: dict[str, Any]) -> BillingAccount | None:
    customer = subscription.get("customer")
    if not isinstance(customer, str) or not customer:
        return None
    return db.scalar(select(BillingAccount).where(BillingAccount.stripe_customer_id == customer))


def _timestamp(value: Any) -> datetime | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return datetime.fromtimestamp(value, UTC)


def _period_field(subscription: dict[str, Any], name: str) -> datetime | None:
    value = subscription.get(name)
    if value is None:
        items = (subscription.get("items") or {}).get("data") or []
        if items and isinstance(items[0], dict):
            value = items[0].get(name)
    return _timestamp(value)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _recover_account(
    db: Session,
    event: dict[str, Any],
    subscription: dict[str, Any],
    now: datetime,
    *,
    deleted: bool,
) -> BillingAccount | None:
    """The account for a subscription event (created, updated or deleted) whose customer no
    account has, found through the user id in the subscription's metadata.

    That happens when the checkout event was lost (a new account is made), or when twin first
    checkouts made two customers and the person paid on the one the route did not keep (the
    person's account moves to it, unless it is on a paid plan). A deletion never moves an
    account: a subscription that ended on another customer says nothing about this one.
    """
    customer = subscription.get("customer")
    user_id = (subscription.get("metadata") or {}).get("user_id")
    if not isinstance(customer, str) or not customer or not isinstance(user_id, str):
        return None
    if db.get(User, user_id) is None:
        log.warning("Stripe event %s: subscription for no usable user", event["id"])
        return None
    existing = db.get(BillingAccount, user_id)
    if existing is not None:
        if deleted or not _move_to_customer(db, event, existing, customer, now):
            return None
        return existing
    account = BillingAccount(
        user_id=user_id,
        stripe_customer_id=customer,
        plan=PLAN_FREE,
        status="",
        cancel_at_period_end=False,
        updated_at=now,
    )
    db.add(account)
    db.flush()
    return account


def _subscription_changed(db: Session, event: dict[str, Any], now: datetime) -> bool:
    return _apply_subscription(db, event, now, deleted=False)


def _subscription_deleted(db: Session, event: dict[str, Any], now: datetime) -> bool:
    return _apply_subscription(db, event, now, deleted=True)


def _apply_subscription(
    db: Session, event: dict[str, Any], now: datetime, *, deleted: bool
) -> bool:
    subscription = _object(event)
    account = _account_for(db, subscription)
    if account is None:
        account = _recover_account(db, event, subscription, now, deleted=deleted)
    if account is None:
        return False
    status = str(subscription.get("status") or "")
    sent_at = _timestamp(event.get("created"))
    if sent_at is not None and account.last_event_at is not None:
        last = _aware(account.last_event_at)
        if sent_at < last:
            return False
        stored_paid = plan_is_paid(account.plan, account.status)
        if sent_at == last and not deleted and status == "incomplete" and stored_paid:
            return False
    sub_id = subscription.get("id")
    sub_id = sub_id if isinstance(sub_id, str) and sub_id else None
    stored_id = account.stripe_subscription_id
    different = stored_id is not None and sub_id != stored_id
    if deleted:
        if different:
            return False
        account.plan = PLAN_FREE
        account.status = "canceled"
        account.cancel_at_period_end = False
    else:
        if different and not plan_is_paid(PLAN_PLUS, status):
            return False
        if different and plan_is_paid(account.plan, account.status):
            # A second paid Plus on the same person (two checkouts both paid). The stored one
            # keeps the plan, so its later events still apply; the duplicate must be refunded.
            log.error(
                "A second paid Plus subscription arrived for a person who already has one; "
                "refund and cancel the duplicate in Stripe"
            )
            return False
        account.plan = PLAN_PLUS if plan_is_paid(PLAN_PLUS, status) else PLAN_FREE
        account.status = status
        if sub_id is not None:
            account.stripe_subscription_id = sub_id
        start = _period_field(subscription, "current_period_start")
        end = _period_field(subscription, "current_period_end")
        if start is not None or end is not None:
            account.period_start = start
            account.period_end = end
        # Older subscriptions say they will end with cancel_at_period_end. Newer ones (flexible
        # billing mode) leave that flag false and set cancel_at instead.
        account.cancel_at_period_end = (
            bool(subscription.get("cancel_at_period_end"))
            or subscription.get("cancel_at") is not None
        )
    if sent_at is not None:
        account.last_event_at = sent_at
    account.updated_at = now
    return True


def _charge_refunded(db: Session, event: dict[str, Any], now: datetime) -> bool:
    charge = _object(event)
    intent = charge.get("payment_intent")
    if not isinstance(intent, str) or not intent:
        return False
    amount = charge.get("amount")
    refunded = charge.get("amount_refunded")
    full = charge.get("refunded") is True or (
        isinstance(amount, int) and isinstance(refunded, int) and amount > 0 and refunded >= amount
    )
    if not full:
        log.info("Stripe event %s: partial refund, credits kept", event["id"])
        return False
    changed = False
    for grant in db.scalars(
        select(CreditGrant).where(
            CreditGrant.stripe_payment_intent == intent, CreditGrant.revoked_at.is_(None)
        )
    ):
        grant.revoked_at = now
        changed = True
    return changed


def _payment_failed(db: Session, event: dict[str, Any], now: datetime) -> bool:
    log.warning("Stripe event %s: a subscription payment failed", event["id"])
    return False


_HANDLERS: dict[str, Callable[[Session, dict[str, Any], datetime], bool]] = {
    "checkout.session.completed": _checkout_completed,
    "customer.subscription.created": _subscription_changed,
    "customer.subscription.updated": _subscription_changed,
    "customer.subscription.deleted": _subscription_deleted,
    "charge.refunded": _charge_refunded,
    "invoice.payment_failed": _payment_failed,
}
