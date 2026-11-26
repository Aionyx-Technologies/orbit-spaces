from __future__ import annotations

import pytest

from orbit.config import Settings
from orbit.plans import (
    AI_PACK_USES,
    EMAIL_PACK_CREDITS,
    GRANT_TTL,
    PLAN_FREE,
    PLAN_PLUS,
    PLUS_AI_USES,
    free_entitlements,
    plan_is_paid,
    plus_entitlements,
)

LIMIT_VARIABLES = (
    "ORBIT_FREE_AI_USES",
    "ORBIT_MAX_UPDATE_EMAILS_PER_DAY",
    "ORBIT_MAX_CREATED_SPACES",
)


@pytest.fixture(autouse=True)
def no_limit_settings_in_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in LIMIT_VARIABLES:
        monkeypatch.delenv(name, raising=False)


def make_settings(**overrides: int) -> Settings:
    return Settings(_env_file=None).model_copy(update=overrides)


def test_free_entitlements_read_the_settings() -> None:
    ent = free_entitlements(make_settings())
    assert ent.plan == PLAN_FREE
    assert ent.ai_uses_per_month == 20
    assert ent.instant_emails_per_day is None
    assert ent.max_created_spaces is None
    assert ent.members_per_space == 10


def test_a_zero_setting_means_no_limit() -> None:
    ent = free_entitlements(
        make_settings(free_ai_uses=0, max_update_emails_per_day=0, max_created_spaces=0)
    )
    assert ent.ai_uses_per_month is None
    assert ent.instant_emails_per_day is None
    assert ent.max_created_spaces is None
    limited = free_entitlements(
        make_settings(free_ai_uses=7, max_update_emails_per_day=3, max_created_spaces=2)
    )
    assert (limited.ai_uses_per_month, limited.instant_emails_per_day) == (7, 3)
    assert limited.max_created_spaces == 2


def test_plus_entitlements_are_the_spec_values() -> None:
    ent = plus_entitlements()
    assert ent.plan == PLAN_PLUS
    assert ent.ai_uses_per_month == PLUS_AI_USES == 150
    assert ent.instant_emails_per_day == 100
    assert ent.max_created_spaces is None
    assert ent.members_per_space == 25
    assert AI_PACK_USES == 100
    assert EMAIL_PACK_CREDITS == 500
    assert GRANT_TTL.days == 365


@pytest.mark.parametrize(
    ("plan", "status", "paid"),
    [
        (PLAN_PLUS, "active", True),
        (PLAN_PLUS, "trialing", True),
        (PLAN_PLUS, "past_due", True),
        (PLAN_PLUS, "canceled", False),
        (PLAN_PLUS, "unpaid", False),
        (PLAN_PLUS, "incomplete_expired", False),
        (PLAN_FREE, "active", False),
    ],
)
def test_only_active_trialing_and_past_due_plus_count_as_paid(
    plan: str, status: str, paid: bool
) -> None:
    assert plan_is_paid(plan, status) is paid
