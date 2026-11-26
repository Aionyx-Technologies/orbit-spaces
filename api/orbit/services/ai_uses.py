"""Monthly AI uses: one use per Combine or start-from-a-sentence, counted per person.

Every use is a line in a ledger. A refund is a second line that points at the use it gives back,
so a person is never charged for a call that gave them nothing. The month runs from the day the
person signed up (or, on a paid plan, from the subscription's period, month by month on a yearly
plan) and rolls over without any job: a use counts against the period it was made in. Once the
monthly allowance is gone, uses are spent from bought packs, earliest to expire first; those lines
carry the pack's id.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.errors import AiUsesExhausted, NotFound
from orbit.models import AiUseEntry, User, new_id
from orbit.services import billing_state
from orbit.services.context import Env
from orbit.services.periods import period_bounds

__all__ = [
    "KIND_COMBINE",
    "KIND_SPACE_SETUP",
    "KIND_TEMPLATE_DRAFT",
    "Allowance",
    "Reservation",
    "allowance",
    "period_bounds",
    "refund",
    "reserve",
]

KIND_COMBINE = "combine"
KIND_SPACE_SETUP = "space_setup"
KIND_TEMPLATE_DRAFT = "template_draft"


@dataclass(frozen=True)
class Allowance:
    limit: int | None
    used: int
    resets_at: datetime

    @property
    def remaining(self) -> int | None:
        return None if self.limit is None else max(self.limit - self.used, 0)


@dataclass(frozen=True)
class Reservation:
    entry_id: str
    user_id: str
    period_start: datetime
    grant_id: str | None = None


def _used_in(db: Session, user_id: str, period_start: datetime) -> int:
    """Uses paid by the monthly allowance; uses paid by a pack are counted on the pack."""
    total = db.scalar(
        select(func.coalesce(func.sum(AiUseEntry.delta), 0)).where(
            AiUseEntry.user_id == user_id,
            AiUseEntry.period_start == period_start,
            AiUseEntry.grant_id.is_(None),
        )
    )
    return int(total or 0)


def allowance(db: Session, env: Env, user: User) -> Allowance:
    now = env.now()
    start, end = billing_state.billing_period(db, user, env.settings, now)
    limit = billing_state.entitlements_for(db, env.settings, user.id, now).ai_uses_per_month
    return Allowance(limit=limit, used=_used_in(db, user.id, start), resets_at=end)


def _exhausted_message(limit: int, resets_at: datetime) -> str:
    return (
        f"You have used all {limit} AI uses for this month. "
        f"They reset on {resets_at.strftime('%b')} {resets_at.day}."
    )


def reserve(db: Session, env: Env, user_id: str, kind: str) -> Reservation | None:
    """Take one use before the AI is called. Returns None when this server does not meter."""
    now = env.now()
    if billing_state.entitlements_for(db, env.settings, user_id, now).ai_uses_per_month is None:
        # The plan lookup opened a transaction; none may stay open during the AI call.
        db.rollback()
        return None
    # The row lock makes check-then-insert atomic when two requests race (Postgres; SQLite
    # already allows one writer at a time). Spends are serialized per person, so the pack
    # balance read below cannot be spent twice.
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise NotFound("That account no longer exists.")
    # Read again under the lock: a plan change may have landed while this request waited.
    limit = billing_state.entitlements_for(db, env.settings, user_id, now).ai_uses_per_month
    if limit is None:
        db.rollback()
        return None
    start, end = billing_state.billing_period(db, user, env.settings, now)
    grant_id: str | None = None
    if _used_in(db, user_id, start) >= limit:
        grant = billing_state.spendable_grant(db, user_id, billing_state.KIND_AI, now)
        if grant is None:
            db.rollback()
            raise AiUsesExhausted(_exhausted_message(limit, end))
        grant_id = grant.id
    entry = AiUseEntry(
        id=new_id(),
        user_id=user_id,
        kind=kind,
        delta=1,
        period_start=start,
        created_at=now,
        grant_id=grant_id,
    )
    db.add(entry)
    db.commit()
    return Reservation(entry_id=entry.id, user_id=user_id, period_start=start, grant_id=grant_id)


def refund(db: Session, env: Env, reservation: Reservation | None) -> None:
    """Give a use back because the AI call gave the person nothing. Safe to call twice."""
    if reservation is None:
        return
    already = db.scalar(select(AiUseEntry.id).where(AiUseEntry.refunds_id == reservation.entry_id))
    if already is not None:
        return
    original = db.get(AiUseEntry, reservation.entry_id)
    if original is None:
        return
    db.add(
        AiUseEntry(
            id=new_id(),
            user_id=reservation.user_id,
            kind=original.kind,
            delta=-1,
            period_start=reservation.period_start,
            refunds_id=reservation.entry_id,
            created_at=env.now(),
            grant_id=original.grant_id,
        )
    )
    db.commit()
