from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from orbit.config import Settings
from orbit.limits import COMBINES_PER_SPACE_PER_DAY
from orbit.llm import CombineFailed
from orbit.main import Overrides, create_app
from orbit.runtime import Runtime
from tests.combine_helpers import DEFAULT_PLAN, FakeCombiner
from tests.conftest import FakeClock, FakeFetcher, RecordingSender
from tests.rest_helpers import People, create_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"


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


def test_the_app_reports_that_combining_is_available(people: People) -> None:
    assert people.as_(ALEX).get("/api/me").json()["combine_enabled"] is True


def test_a_combined_plan_comes_back_as_a_labelled_orbit_item(
    people: People, fake_llm: FakeCombiner
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    share(people.as_(BLAKE), space["id"], "Hotels", "Three options")

    response = people.as_(ALEX).post(
        f"/api/spaces/{space['id']}/combine", json={"instruction": "keep it short"}
    )

    body = response.json()
    assert response.status_code == 200
    assert body["created"] is True
    plan = body["item"]
    assert plan["kind"] == "plan"
    assert plan["author_kind"] == "orbit"
    assert plan["shared_by"] is None
    assert plan["content"] == DEFAULT_PLAN
    assert plan["via"] == "web"
    assert plan["can_retract"] is False
    assert fake_llm.calls[0].instruction == "keep it short"
    detail = people.as_(BLAKE).get(f"/api/spaces/{space['id']}").json()
    assert detail["latest_plan"]["id"] == plan["id"]


def test_asking_again_returns_the_same_plan_without_creating_one(people: People) -> None:
    space = create_space(people.as_(ALEX))
    share(people.as_(ALEX), space["id"], "Note", "Body")
    first = people.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={}).json()

    again = people.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={}).json()

    assert again["created"] is False
    assert again["item"]["id"] == first["item"]["id"]


def test_each_failure_has_its_own_status_and_plain_message(
    people: People, fake_llm: FakeCombiner
) -> None:
    space = create_space(people.as_(ALEX))
    url = f"/api/spaces/{space['id']}/combine"
    empty = people.as_(ALEX).post(url, json={})
    share(people.as_(ALEX), space["id"], "Note", "Body")
    fake_llm.error = CombineFailed("The AI service is busy right now. Try again in a minute.")
    failed = people.as_(ALEX).post(url, json={})
    too_long = people.as_(ALEX).post(url, json={"instruction": "x" * 501})
    stranger = people.as_(BLAKE).post(url, json={})

    assert empty.status_code == 422
    assert (
        empty.json()["error"]["message"]
        == "There is nothing to combine yet. Share something first."
    )
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "unavailable"
    assert too_long.status_code == 422
    assert stranger.status_code == 403


def test_the_daily_limit_is_a_429(people: People) -> None:
    space = create_space(people.as_(ALEX))
    client = people.as_(ALEX)
    for number in range(COMBINES_PER_SPACE_PER_DAY):
        share(client, space["id"], f"Item {number}", "Body")
        assert client.post(f"/api/spaces/{space['id']}/combine", json={}).status_code == 200
    share(client, space["id"], "One more", "Body")

    blocked = client.post(f"/api/spaces/{space['id']}/combine", json={})

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"


def test_combine_requires_a_session_and_the_sites_own_origin(people: People) -> None:
    space = create_space(people.as_(ALEX))
    url = f"/api/spaces/{space['id']}/combine"

    anonymous = people.anonymous().post(url, json={})
    foreign = people.as_(ALEX).post(url, json={}, headers={"Origin": "https://evil.example"})

    assert anonymous.status_code == 401
    assert foreign.status_code == 403


def test_without_a_model_the_app_says_combining_is_off_and_the_route_refuses(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    plain = create_app(settings, overrides=Overrides(clock=clock, sender=sender))
    with TestClient(
        plain,
        base_url="https://orbit.test",
        follow_redirects=False,
        headers={"Origin": "https://orbit.test"},
    ) as client:
        crowd = People(client, plain.state.runtime, sender)
        space = create_space(crowd.as_(ALEX))
        share(crowd.as_(ALEX), space["id"], "Note", "Body")

        flag = crowd.as_(ALEX).get("/api/me").json()["combine_enabled"]
        refused = crowd.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={})

    assert flag is False
    assert refused.status_code == 503
    assert refused.json()["error"]["message"] == "Combining is not set up on this server."
