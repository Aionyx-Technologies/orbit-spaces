"""Plans and what each one allows. A limit of None means no limit."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from orbit.config import Settings
from orbit.limits import MEMBERS_PER_SPACE

PLAN_FREE = "free"
PLAN_PLUS = "plus"

PLUS_AI_USES = 150
PLUS_INSTANT_EMAILS = 100
PLUS_MEMBERS_PER_SPACE = 25
AI_PACK_USES = 100
EMAIL_PACK_CREDITS = 500
GRANT_TTL = timedelta(days=365)

PAID_STATUSES = frozenset({"active", "trialing", "past_due"})


@dataclass(frozen=True)
class Entitlements:
    plan: str
    ai_uses_per_month: int | None
    instant_emails_per_day: int | None
    max_created_spaces: int | None
    members_per_space: int


def free_entitlements(settings: Settings) -> Entitlements:
    """The free plan: the server's settings decide, and a setting of 0 means no limit."""
    return Entitlements(
        plan=PLAN_FREE,
        ai_uses_per_month=settings.free_ai_uses or None,
        instant_emails_per_day=settings.max_update_emails_per_day or None,
        max_created_spaces=settings.max_created_spaces or None,
        members_per_space=MEMBERS_PER_SPACE,
    )


def plus_entitlements() -> Entitlements:
    return Entitlements(
        plan=PLAN_PLUS,
        ai_uses_per_month=PLUS_AI_USES,
        instant_emails_per_day=PLUS_INSTANT_EMAILS,
        max_created_spaces=None,
        members_per_space=PLUS_MEMBERS_PER_SPACE,
    )


def plan_is_paid(plan: str, status: str) -> bool:
    return plan == PLAN_PLUS and status in PAID_STATUSES
