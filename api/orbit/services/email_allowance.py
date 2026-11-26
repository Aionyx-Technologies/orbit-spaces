"""Instant update emails: a daily count kept in the database, then bought email packs.

Every instant email is a row. The plan's daily cap counts rows from the last 24 hours that no pack
paid for; past the cap, a send is spent from a bought pack (earliest to expire first) and the row
carries the pack's id. Mail that neither can pay for is held back by the caller.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.models import EmailSend, User, new_id
from orbit.services import billing_state

WINDOW = timedelta(days=1)
RETENTION = timedelta(days=2)


def _sent_unpaid(db: Session, user_id: str, now: datetime) -> int:
    """Sends in the window paid by the plan; sends paid by a pack are counted on the pack."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(EmailSend)
            .where(
                EmailSend.user_id == user_id,
                EmailSend.sent_at > now - WINDOW,
                EmailSend.grant_id.is_(None),
            )
        )
        or 0
    )


@dataclass(frozen=True)
class EmailUsage:
    limit: int
    used: int
    remaining: int


def usage(db: Session, settings: Settings, user_id: str, now: datetime) -> EmailUsage | None:
    """What the person has used of their daily cap, or None when they have no cap."""
    cap = billing_state.entitlements_for(db, settings, user_id, now).instant_emails_per_day
    if cap is None:
        return None
    used = _sent_unpaid(db, user_id, now)
    return EmailUsage(limit=cap, used=used, remaining=max(cap - used, 0))


def try_send(db: Session, settings: Settings, user_id: str, now: datetime) -> bool:
    """Take one instant email for the person. The caller commits."""
    # Spends are serialized per person, so the count and pack balance cannot be spent twice.
    db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    cap = billing_state.entitlements_for(db, settings, user_id, now).instant_emails_per_day
    grant_id: str | None = None
    if cap is not None and _sent_unpaid(db, user_id, now) >= cap:
        grant = billing_state.spendable_grant(db, user_id, billing_state.KIND_EMAIL, now)
        if grant is None:
            return False
        grant_id = grant.id
    db.add(EmailSend(id=new_id(), user_id=user_id, sent_at=now, grant_id=grant_id))
    db.flush()
    return True


def last_allowance_cap(db: Session, settings: Settings, user_id: str, now: datetime) -> int:
    """The person's daily cap when they have just used the last of it, else 0."""
    cap = billing_state.entitlements_for(db, settings, user_id, now).instant_emails_per_day
    if cap is None or _sent_unpaid(db, user_id, now) < cap:
        return 0
    if billing_state.pack_credits_left(db, user_id, billing_state.KIND_EMAIL, now) > 0:
        return 0
    return cap


def used_the_last_allowance(db: Session, settings: Settings, user_id: str, now: datetime) -> bool:
    return last_allowance_cap(db, settings, user_id, now) > 0


def prune(db: Session, now: datetime) -> int:
    """Forget plan-paid sends too old to count against any window. The caller commits.

    Pack-paid sends stay: a pack's balance is its amount minus the sends that point at it.
    """
    result = db.execute(
        delete(EmailSend).where(EmailSend.sent_at < now - RETENTION, EmailSend.grant_id.is_(None))
    )
    return int(getattr(result, "rowcount", 0) or 0)
