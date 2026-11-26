"""What plan a person is on and how much of their bought credit is left.

Shared by AI uses and instant emails, so neither has to know how a subscription or a grant
is stored.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.models import AiUseEntry, BillingAccount, CreditGrant, EmailSend, Space, User
from orbit.plans import Entitlements, free_entitlements, plan_is_paid, plus_entitlements
from orbit.services.periods import period_bounds

KIND_AI = "ai"
KIND_EMAIL = "email"

# A stored period longer than this is a yearly (or longer) subscription: it is metered per month.
_LONGEST_MONTH = timedelta(days=32)


def _paid_account(db: Session, user_id: str) -> BillingAccount | None:
    account = db.get(BillingAccount, user_id)
    if account is not None and plan_is_paid(account.plan, account.status):
        return account
    return None


def entitlements_for(db: Session, settings: Settings, user_id: str, now: datetime) -> Entitlements:
    free = free_entitlements(settings)
    if _paid_account(db, user_id) is None:
        return free
    plus = plus_entitlements()
    # A paid plan is never worse than Free: where this server sets no Free limit, Plus has none.
    return replace(
        plus,
        ai_uses_per_month=None if free.ai_uses_per_month is None else plus.ai_uses_per_month,
        instant_emails_per_day=(
            None if free.instant_emails_per_day is None else plus.instant_emails_per_day
        ),
    )


def members_cap(db: Session, settings: Settings, space: Space, now: datetime) -> int:
    """How many people a space holds: set by its owner's plan, the Free cap if the owner is gone."""
    if space.created_by is None:
        return free_entitlements(settings).members_per_space
    return entitlements_for(db, settings, space.created_by, now).members_per_space


def billing_period(
    db: Session, user: User, settings: Settings, now: datetime
) -> tuple[datetime, datetime]:
    """The month AI uses are counted in.

    On a paid plan it follows the subscription: a monthly subscription's period as Stripe sent
    it, and for a longer (yearly) one the month inside it that holds now, anchored on the
    period's start and never ending after it. When now is past the stored end (the renewal
    event is late), the month after it is used, so a reset date is never in the past. Without a
    paid plan, the month runs from the person's signup day.
    """
    account = _paid_account(db, user.id)
    if account is not None and account.period_start and account.period_end:
        start, end = account.period_start, account.period_end
        if now >= end:
            return period_bounds(start, now)
        if end - start > _LONGEST_MONTH:
            month_start, month_end = period_bounds(start, max(now, start))
            return month_start, min(month_end, end)
        return start, end
    return period_bounds(user.created_at, now)


def grant_remaining(db: Session, grant: CreditGrant) -> int:
    if grant.kind == KIND_AI:
        spent = db.scalar(
            select(func.coalesce(func.sum(AiUseEntry.delta), 0)).where(
                AiUseEntry.grant_id == grant.id
            )
        )
    else:
        spent = db.scalar(
            select(func.count()).select_from(EmailSend).where(EmailSend.grant_id == grant.id)
        )
    return grant.amount - int(spent or 0)


def _live_grants(
    db: Session, user_id: str, kind: str, now: datetime, *, lock: bool = False
) -> list[CreditGrant]:
    query = (
        select(CreditGrant)
        .where(
            CreditGrant.user_id == user_id,
            CreditGrant.kind == kind,
            CreditGrant.revoked_at.is_(None),
            CreditGrant.expires_at > now,
        )
        .order_by(CreditGrant.expires_at, CreditGrant.created_at, CreditGrant.id)
    )
    if lock:
        query = query.with_for_update()
    return list(db.scalars(query))


def spendable_grant(db: Session, user_id: str, kind: str, now: datetime) -> CreditGrant | None:
    """The pack to spend from next: earliest to expire first, row-locked."""
    for grant in _live_grants(db, user_id, kind, now, lock=True):
        if grant_remaining(db, grant) > 0:
            return grant
    return None


def pack_credits_left(db: Session, user_id: str, kind: str, now: datetime) -> int:
    return sum(max(grant_remaining(db, grant), 0) for grant in _live_grants(db, user_id, kind, now))
