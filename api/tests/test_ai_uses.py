from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.errors import AiUsesExhausted
from orbit.llm import CombineFailed
from orbit.main import Overrides, create_app
from orbit.models import AiUseEntry, User
from orbit.runtime import Runtime
from orbit.services import ai_uses
from orbit.services import combine as combine_service
from orbit.services import items as items_service
from orbit.services.context import Env
from tests.combine_helpers import FakeCombiner
from tests.conftest import Factory, FakeClock, FakeFetcher, Person, RecordingSender
from tests.rest_helpers import People, create_space, share

ALEX = "alex@example.com"


def at(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


def test_the_period_starts_on_the_signup_day_of_the_month() -> None:
    start, end = ai_uses.period_bounds(at(2026, 3, 15), at(2026, 11, 24))

    assert (start, end) == (at(2026, 11, 15), at(2026, 12, 15))


def test_the_period_before_the_signup_day_is_the_one_that_began_last_month() -> None:
    start, end = ai_uses.period_bounds(at(2026, 3, 15), at(2026, 11, 3))

    assert (start, end) == (at(2026, 10, 15), at(2026, 11, 15))


def test_a_signup_on_the_31st_rolls_over_on_the_last_day_of_short_months() -> None:
    start, end = ai_uses.period_bounds(at(2026, 1, 31), at(2026, 2, 28, 18))

    assert (start, end) == (at(2026, 2, 28), at(2026, 3, 31))


def test_the_period_rolls_across_a_year_boundary() -> None:
    start, end = ai_uses.period_bounds(at(2025, 12, 20), at(2026, 1, 2))

    assert (start, end) == (at(2025, 12, 20), at(2026, 1, 20))


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user(ALEX)


def used(db: Session, env: Env, person: Person) -> int:
    user = db.get(User, person.id)
    assert user is not None
    return ai_uses.allowance(db, env, user).used


def test_a_use_counts_against_the_allowance(db: Session, env: Env, alex: Person) -> None:
    ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    user = db.get(User, alex.id)
    assert user is not None
    result = ai_uses.allowance(db, env, user)
    assert (result.limit, result.used, result.remaining) == (20, 1, 19)


def test_the_twenty_first_use_in_a_period_is_refused(db: Session, env: Env, alex: Person) -> None:
    for _ in range(20):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    with pytest.raises(AiUsesExhausted) as caught:
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    assert "all 20 AI uses" in caught.value.message
    assert db.scalar(select(func.count()).select_from(AiUseEntry)) == 20


def test_a_refund_gives_the_use_back_once(db: Session, env: Env, alex: Person) -> None:
    reservation = ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    ai_uses.refund(db, env, reservation)
    ai_uses.refund(db, env, reservation)

    assert used(db, env, alex) == 0


def test_uses_reset_when_the_next_period_begins(
    db: Session, env: Env, clock: FakeClock, alex: Person
) -> None:
    for _ in range(20):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    clock.advance(days=32)

    assert ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE) is not None
    assert used(db, env, alex) == 1


def test_people_do_not_share_an_allowance(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    blake = make.user("blake@example.com")
    for _ in range(20):
        ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    assert ai_uses.reserve(db, env, blake.id, ai_uses.KIND_COMBINE) is not None


def test_a_server_with_no_limit_does_not_meter(
    db: Session, settings: Settings, clock: FakeClock, alex: Person
) -> None:
    open_env = Env(settings=settings.model_copy(update={"free_ai_uses": 0}), clock=clock)

    assert ai_uses.reserve(db, open_env, alex.id, ai_uses.KIND_COMBINE) is None
    user = db.get(User, alex.id)
    assert user is not None
    assert ai_uses.allowance(db, open_env, user).remaining is None


def test_deleting_an_account_removes_its_ledger(db: Session, env: Env, alex: Person) -> None:
    ai_uses.reserve(db, env, alex.id, ai_uses.KIND_COMBINE)

    db.delete(db.get(User, alex.id))
    db.commit()

    assert db.scalar(select(func.count()).select_from(AiUseEntry)) == 0


def test_the_service_refunds_when_the_ai_call_raises_something_unexpected(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    class Boom(RuntimeError):
        pass

    def explode(*_args: object, **_kwargs: object) -> str:
        raise Boom

    space = make.space(alex)
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Three options")
    env.llm = explode

    with pytest.raises(Boom):
        combine_service.combine_space(db, env, alex.web(), space.id, None)

    assert used(db, env, alex) == 0


@pytest.fixture
def fake_llm() -> FakeCombiner:
    return FakeCombiner()


@pytest.fixture
def app(
    settings: Settings,
    clock: FakeClock,
    sender: RecordingSender,
    fetcher: FakeFetcher,
    fake_llm: FakeCombiner,
) -> FastAPI:
    return create_app(
        settings, overrides=Overrides(clock=clock, sender=sender, fetcher=fetcher, llm=fake_llm)
    )


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def test_a_combine_costs_one_use_and_me_shows_what_is_left(people: People) -> None:
    alex = people.as_(ALEX)
    space = create_space(alex, "Goa trip")
    share(alex, space["id"], "Hotels", "Three options")

    assert alex.get("/api/me").json()["ai_uses"]["remaining"] == 20
    assert alex.post(f"/api/spaces/{space['id']}/combine", json={}).status_code == 200

    uses = alex.get("/api/me").json()["ai_uses"]
    assert (uses["limit"], uses["used"], uses["remaining"]) == (20, 1, 19)
    assert uses["resets_at"]


def test_a_combine_that_returns_the_existing_plan_is_free(people: People) -> None:
    alex = people.as_(ALEX)
    space = create_space(alex, "Goa trip")
    share(alex, space["id"], "Hotels", "Three options")
    alex.post(f"/api/spaces/{space['id']}/combine", json={})

    again = alex.post(f"/api/spaces/{space['id']}/combine", json={})

    assert again.json()["created"] is False
    assert alex.get("/api/me").json()["ai_uses"]["used"] == 1


def test_a_failed_combine_costs_nothing(people: People, fake_llm: FakeCombiner) -> None:
    alex = people.as_(ALEX)
    space = create_space(alex, "Goa trip")
    share(alex, space["id"], "Hotels", "Three options")
    fake_llm.error = CombineFailed("The AI service is busy right now. Try again in a minute.")

    response = alex.post(f"/api/spaces/{space['id']}/combine", json={})

    assert response.status_code == 503
    assert alex.get("/api/me").json()["ai_uses"]["used"] == 0


def test_an_empty_allowance_stops_the_combine_before_the_ai_is_called(
    people: People, fake_llm: FakeCombiner
) -> None:
    alex = people.as_(ALEX)
    space = create_space(alex, "Goa trip")
    share(alex, space["id"], "Hotels", "Three options")
    user_id = alex.get("/api/me").json()["id"]
    with people.runtime.session_factory() as db:
        for _ in range(20):
            ai_uses.reserve(db, people.runtime.env, user_id, ai_uses.KIND_COMBINE)

    response = alex.post(f"/api/spaces/{space['id']}/combine", json={})

    assert response.status_code == 402
    assert response.json()["error"]["code"] == "ai_uses_exhausted"
    assert fake_llm.calls == []
