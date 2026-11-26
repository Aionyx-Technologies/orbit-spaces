from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from orbit.config import Settings
from orbit.limits import TEMPLATE_DRAFTS_PER_USER_PER_DAY
from orbit.llm import CombineFailed
from orbit.main import Overrides, create_app
from orbit.runtime import Runtime
from orbit.space_templates import builtin_templates
from tests.combine_helpers import FakeCombiner
from tests.conftest import FakeClock, FakeFetcher, RecordingSender
from tests.rest_helpers import People, create_space, join, share
from tests.template_helpers import DRAFTED, FakeDrafter, drafted_reply

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"
DRAFTS_PER_DAY = TEMPLATE_DRAFTS_PER_USER_PER_DAY[0]


@pytest.fixture
def fake_llm() -> FakeCombiner:
    return FakeCombiner()


@pytest.fixture
def fake_drafter() -> FakeDrafter:
    return FakeDrafter()


@pytest.fixture
def app(
    settings: Settings,
    clock: FakeClock,
    sender: RecordingSender,
    fetcher: FakeFetcher,
    fake_llm: FakeCombiner,
    fake_drafter: FakeDrafter,
) -> FastAPI:
    return create_app(
        settings,
        overrides=Overrides(
            clock=clock, sender=sender, fetcher=fetcher, llm=fake_llm, drafter=fake_drafter
        ),
    )


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def make_space(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post("/api/spaces", json={"name": "Goa trip", **body})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def detail(client: TestClient, space_id: str) -> dict[str, Any]:
    response = client.get(f"/api/spaces/{space_id}")
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def test_the_built_in_templates_are_listed_with_general_first(people: People) -> None:
    response = people.as_(ALEX).get("/api/templates")

    body = response.json()
    assert response.status_code == 200
    assert [template["id"] for template in body["templates"]] == list(builtin_templates())
    family = next(t for t in body["templates"] if t["id"] == "trip")
    assert family["name"] == "Trip"
    assert family["plan_sections"][-1] == "To settle"
    assert family["facts"][0] == {"key": "Dates", "hint": "When you are going"}


def test_listing_templates_needs_a_session(people: People) -> None:
    assert people.anonymous().get("/api/templates").status_code == 401


def test_a_space_created_without_a_template_uses_general(people: People) -> None:
    created = make_space(people.as_(ALEX))

    space = detail(people.as_(ALEX), created["id"])
    assert space["template"]["id"] == "general"
    assert space["template"]["plan_sections"] == ["Summary", "Next steps", "To settle"]
    assert space["unset_facts"] == []


def test_a_space_can_start_from_a_built_in_template(people: People) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")

    space = detail(people.as_(ALEX), created["id"])
    assert space["template"]["id"] == "trip"
    assert [fact["key"] for fact in space["unset_facts"]] == [
        "Dates",
        "Destination",
        "Headcount",
        "Budget",
    ]
    assert space["unset_facts"][3] == {"key": "Budget", "hint": "Total or per person"}
    assert space["template"]["tips"] == [
        "Share a shortlist of places to stay",
        "Add the dates everyone can make",
        "Set a budget",
    ]


def test_a_space_can_start_from_a_full_custom_template(people: People) -> None:
    created = make_space(people.as_(ALEX), template=DRAFTED)

    space = detail(people.as_(ALEX), created["id"])
    template = space["template"]
    assert template["id"] == "custom"
    assert template["name"] == "Garden club"
    assert template["plan_sections"] == ["This month", "Shopping list", "To settle"]
    assert [fact["key"] for fact in space["unset_facts"]] == ["Plot", "Watering rota"]


def test_a_custom_template_that_names_an_id_cannot_pose_as_a_built_in(people: People) -> None:
    created = make_space(people.as_(ALEX), template={**DRAFTED, "id": "trip"})

    assert detail(people.as_(ALEX), created["id"])["template"]["id"] == "custom"


def test_sending_an_id_and_a_template_together_is_refused(people: People) -> None:
    response = people.as_(ALEX).post(
        "/api/spaces", json={"name": "Goa", "template_id": "general", "template": DRAFTED}
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Send either template_id or template, not both."
    assert people.as_(ALEX).get("/api/spaces").json()["spaces"] == []


def test_an_unknown_template_id_is_refused_and_creates_no_space(people: People) -> None:
    response = people.as_(ALEX).post("/api/spaces", json={"name": "Goa", "template_id": "nope"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_template"
    assert "Available templates: trip, holiday-gifts" in response.json()["error"]["message"]
    assert people.as_(ALEX).get("/api/spaces").json()["spaces"] == []


@pytest.mark.parametrize(
    ("template", "fragment"),
    [
        ({**DRAFTED, "name": ""}, "Template name cannot be empty."),
        ({**DRAFTED, "name": "n" * 41}, "Template name is too long."),
        ({**DRAFTED, "plan_sections": [f"S{n}" for n in range(8)]}, "at most 8 plan sections"),
        ({**DRAFTED, "tips": ["t"] * 6}, "at most 5 tips"),
        (
            {**DRAFTED, "facts": [{"key": "A", "hint": ""}, {"key": "a", "hint": ""}]},
            "different key",
        ),
    ],
)
def test_an_invalid_custom_template_is_refused_with_a_plain_message(
    people: People, template: dict[str, Any], fragment: str
) -> None:
    response = people.as_(ALEX).post("/api/spaces", json={"name": "Goa", "template": template})

    assert response.status_code == 422
    assert fragment in response.json()["error"]["message"]
    assert people.as_(ALEX).get("/api/spaces").json()["spaces"] == []


def test_the_unset_list_shrinks_as_members_set_facts(people: People) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")
    join(people, ALEX, BLAKE, created["id"])

    people.as_(BLAKE).put(
        f"/api/spaces/{created['id']}/memory", json={"key": "budget", "value": "$3,000"}
    )

    space = detail(people.as_(ALEX), created["id"])
    assert [fact["key"] for fact in space["unset_facts"]] == ["Dates", "Destination", "Headcount"]
    assert [fact["key"] for fact in space["memory"]] == ["budget"]


def test_any_member_can_replace_the_template_and_it_is_seen_by_everyone(people: People) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")
    join(people, ALEX, BLAKE, created["id"])
    body = {
        "name": "Our trip",
        "description": "Just us",
        "facts": [{"key": "Flights", "hint": "Who books what"}],
        "plan_sections": ["Flights", "To settle", "Food"],
        "combine_hint": "Cheapest wins.",
        "tips": ["Book early"],
        "id": "ignored",
    }

    response = people.as_(BLAKE).put(f"/api/spaces/{created['id']}/template", json=body)

    assert response.status_code == 200
    saved = response.json()
    assert saved["id"] == "trip"
    assert saved["name"] == "Our trip"
    assert saved["plan_sections"] == ["Flights", "Food", "To settle"]
    seen = detail(people.as_(ALEX), created["id"])
    assert seen["template"] == saved
    assert [fact["key"] for fact in seen["unset_facts"]] == ["Flights"]


def test_replacing_the_template_keeps_facts_items_and_plans(
    people: People, fake_llm: FakeCombiner
) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")
    client = people.as_(ALEX)
    client.put(f"/api/spaces/{created['id']}/memory", json={"key": "Dates", "value": "Dec 20"})
    share(client, created["id"], "Hotels", "Three options")
    plan = client.post(f"/api/spaces/{created['id']}/combine", json={}).json()["item"]

    client.put(f"/api/spaces/{created['id']}/template", json={"name": "Other"})

    after = detail(client, created["id"])
    assert [fact["key"] for fact in after["memory"]] == ["Dates"]
    assert after["latest_plan"]["id"] == plan["id"]
    assert len(client.get(f"/api/spaces/{created['id']}/items").json()["items"]) == 2


def test_a_stranger_cannot_replace_or_read_a_template(people: People) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")

    replaced = people.as_(CAROL).put(
        f"/api/spaces/{created['id']}/template", json={"name": "Mine now"}
    )
    read = people.as_(CAROL).get(f"/api/spaces/{created['id']}")

    assert replaced.status_code == 403
    assert read.status_code == 403
    assert detail(people.as_(ALEX), created["id"])["template"]["name"] == "Trip"


def test_an_invalid_replacement_is_refused_and_changes_nothing(people: People) -> None:
    created = make_space(people.as_(ALEX), template_id="trip")

    response = people.as_(ALEX).put(
        f"/api/spaces/{created['id']}/template", json={"name": "n" * 41}
    )

    assert response.status_code == 422
    assert detail(people.as_(ALEX), created["id"])["template"]["name"] == "Trip"


def test_replacing_a_template_needs_a_session_and_the_sites_own_origin(people: People) -> None:
    created = make_space(people.as_(ALEX))
    url = f"/api/spaces/{created['id']}/template"

    anonymous = people.anonymous().put(url, json={"name": "X"})
    foreign = people.as_(ALEX).put(url, json={"name": "X"}, headers={"Origin": "https://evil.test"})
    missing = people.as_(ALEX).put("/api/spaces/missing/template", json={"name": "X"})

    assert anonymous.status_code == 401
    assert foreign.status_code == 403
    assert missing.status_code == 404


def test_the_combine_route_uses_the_spaces_template(people: People, fake_llm: FakeCombiner) -> None:
    created = make_space(people.as_(ALEX), template_id="team-project")
    share(people.as_(ALEX), created["id"], "Plan", "Body")

    response = people.as_(ALEX).post(f"/api/spaces/{created['id']}/combine", json={})

    assert response.status_code == 200
    assert fake_llm.calls[0].template is not None
    assert fake_llm.calls[0].template.id == "team-project"


def test_the_export_includes_the_spaces_template(people: People) -> None:
    created = make_space(people.as_(ALEX), template=DRAFTED)

    exported = people.as_(ALEX).get(f"/api/spaces/{created['id']}/export").json()

    assert exported["template"]["name"] == "Garden club"
    assert exported["template"]["plan_sections"][-1] == "To settle"


def test_the_app_reports_that_drafting_is_available(people: People) -> None:
    assert people.as_(ALEX).get("/api/me").json()["draft_enabled"] is True


def test_a_draft_comes_back_for_confirmation_and_saves_nothing(
    people: People, fake_drafter: FakeDrafter
) -> None:
    response = people.as_(ALEX).post("/api/templates/draft", json={"purpose": "  a garden   club "})

    body = response.json()
    assert response.status_code == 200
    assert body["drafted"] is True
    assert body["template"]["id"] == "custom"
    assert body["template"]["name"] == "Garden club"
    assert body["template"]["plan_sections"][-1] == "To settle"
    assert fake_drafter.purposes == ["a garden club"]
    assert people.as_(ALEX).get("/api/spaces").json()["spaces"] == []


def test_a_draft_that_is_invalid_twice_offers_general_to_start_from(
    people: People, fake_drafter: FakeDrafter
) -> None:
    fake_drafter.replies = ["not json", drafted_reply(name="")]

    body = people.as_(ALEX).post("/api/templates/draft", json={"purpose": "a garden club"}).json()

    assert body["drafted"] is False
    assert body["template"]["id"] == "general"


def test_a_drafted_template_can_be_used_to_create_a_space_after_confirming(
    people: People,
) -> None:
    client = people.as_(ALEX)
    drafted = client.post("/api/templates/draft", json={"purpose": "a garden club"}).json()
    confirmed = {**drafted["template"], "name": "Garden club (edited)"}

    created = make_space(client, template=confirmed)

    space = detail(client, created["id"])
    assert space["template"]["id"] == "custom"
    assert space["template"]["name"] == "Garden club (edited)"


@pytest.mark.parametrize(
    ("body", "status", "fragment"),
    [
        ({"purpose": ""}, 422, "Purpose cannot be empty."),
        ({}, 422, "Purpose cannot be empty."),
        ({"purpose": "x" * 281}, 422, "Purpose is too long."),
    ],
)
def test_a_bad_purpose_is_refused_without_calling_the_model(
    people: People, fake_drafter: FakeDrafter, body: dict[str, Any], status: int, fragment: str
) -> None:
    response = people.as_(ALEX).post("/api/templates/draft", json=body)

    assert response.status_code == status
    assert fragment in response.json()["error"]["message"]
    assert fake_drafter.purposes == []


def test_a_model_failure_is_a_503_with_a_plain_message(
    people: People, fake_drafter: FakeDrafter
) -> None:
    fake_drafter.error = CombineFailed("The AI service is busy right now. Try again in a minute.")

    response = people.as_(ALEX).post("/api/templates/draft", json={"purpose": "a garden club"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "unavailable"
    assert "busy right now" in response.json()["error"]["message"]


def test_the_sixth_draft_in_a_day_is_a_429(people: People) -> None:
    client = people.as_(ALEX)
    for _ in range(DRAFTS_PER_DAY):
        assert client.post("/api/templates/draft", json={"purpose": "a club"}).status_code == 200

    blocked = client.post("/api/templates/draft", json={"purpose": "a club"})

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert people.as_(BLAKE).post("/api/templates/draft", json={"purpose": "x"}).status_code == 200


def test_drafting_needs_a_session_and_the_sites_own_origin(people: People) -> None:
    anonymous = people.anonymous().post("/api/templates/draft", json={"purpose": "a club"})
    foreign = people.as_(ALEX).post(
        "/api/templates/draft", json={"purpose": "a club"}, headers={"Origin": "https://evil.test"}
    )

    assert anonymous.status_code == 401
    assert foreign.status_code == 403


def test_without_a_model_the_app_says_drafting_is_off_and_the_route_refuses(
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

        flag = crowd.as_(ALEX).get("/api/me").json()["draft_enabled"]
        refused = crowd.as_(ALEX).post("/api/templates/draft", json={"purpose": "a club"})
        still_works = create_space(crowd.as_(ALEX), "Goa")

    assert flag is False
    assert refused.status_code == 503
    assert "Start from General" in refused.json()["error"]["message"]
    assert still_works["name"] == "Goa"


def test_templates_carry_an_icon_and_no_old_ids(people: People) -> None:
    body = people.as_(ALEX).get("/api/templates").json()

    by_id = {template["id"]: template for template in body["templates"]}
    assert by_id["trip"]["icon"] == "✈️"
    assert all("icon" in template for template in body["templates"])
    assert "family-vacation" not in by_id
    assert "friends-trip" not in by_id


def test_post_suggest(people: People, fake_drafter: FakeDrafter) -> None:
    client = people.as_(ALEX)

    response = client.post("/api/spaces/suggest", json={"purpose": "Goa trip, Dec 20-27, 6 of us"})

    body = response.json()
    assert response.status_code == 200
    assert body["suggested"] is True
    assert body["name"] == "Goa trip"
    assert body["base_template_id"] == "trip"
    assert body["template"]["id"] == "custom"
    assert body["template"]["name"] == "Trip"
    assert {"key": "Headcount", "value": "6"} in body["facts"]
    assert client.get("/api/spaces").json()["spaces"] == []


def test_post_suggest_refuses_a_purpose_over_280_characters(
    people: People, fake_drafter: FakeDrafter
) -> None:
    response = people.as_(ALEX).post("/api/spaces/suggest", json={"purpose": "x" * 281})

    assert response.status_code == 422
    assert "Purpose is too long." in response.json()["error"]["message"]
    assert fake_drafter.suggestions == []
