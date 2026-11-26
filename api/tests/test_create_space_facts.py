from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from orbit.runtime import Runtime
from tests.conftest import RecordingSender
from tests.rest_helpers import People, create_space

ALEX = "alex@example.com"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def _space_count(client: TestClient) -> int:
    return len(client.get("/api/spaces").json()["spaces"])


def test_create_with_facts_saves_them(people: People) -> None:
    client = people.as_(ALEX)
    me = client.get("/api/me").json()["id"]

    created = client.post(
        "/api/spaces",
        json={
            "name": "Goa trip",
            "template_id": "trip",
            "facts": [
                {"key": "Dates", "value": "Dec 20-27", "suggested": True},
                {"key": "Headcount", "value": "6"},
            ],
        },
    )

    assert created.status_code == 201, created.text
    detail = client.get(f"/api/spaces/{created.json()['id']}").json()
    facts = {fact["key"]: fact for fact in detail["memory"]}
    assert set(facts) == {"Dates", "Headcount"}
    assert facts["Dates"]["via"] == "orbit-suggestion"
    assert facts["Headcount"]["via"] == "web"
    assert facts["Dates"]["set_by"]["user_id"] == me
    assert facts["Headcount"]["set_by"]["user_id"] == me


def test_create_rolls_back_on_bad_fact(people: People) -> None:
    client = people.as_(ALEX)

    response = client.post(
        "/api/spaces",
        json={
            "name": "Goa trip",
            "facts": [{"key": "Dates", "value": "Dec 20"}, {"key": "Budget", "value": "  "}],
        },
    )

    assert response.status_code == 422
    assert _space_count(client) == 0


def test_create_rejects_duplicate_fact_keys(people: People) -> None:
    client = people.as_(ALEX)

    response = client.post(
        "/api/spaces",
        json={
            "name": "Goa trip",
            "facts": [{"key": "Budget", "value": "1"}, {"key": "budget", "value": "2"}],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Each fact can only be set once."
    assert _space_count(client) == 0


def test_create_rejects_too_many_facts(people: People) -> None:
    client = people.as_(ALEX)

    response = client.post(
        "/api/spaces",
        json={"name": "Goa trip", "facts": [{"key": f"K{i}", "value": "v"} for i in range(11)]},
    )

    assert response.status_code == 422
    assert _space_count(client) == 0


def test_create_without_facts_unchanged(people: People) -> None:
    client = people.as_(ALEX)

    space = create_space(client)

    assert client.get(f"/api/spaces/{space['id']}").json()["memory"] == []


def test_first_facts_are_new_facts_in_the_history(people: People) -> None:
    client = people.as_(ALEX)
    created = client.post(
        "/api/spaces",
        json={
            "name": "Goa trip",
            "facts": [
                {"key": "Dates", "value": "Dec 20-27", "suggested": True},
                {"key": "Headcount", "value": "6"},
            ],
        },
    ).json()
    url = f"/api/spaces/{created['id']}/memory"

    client.put(url, json={"key": "Dates", "value": "Dec 21-28"})
    client.post(f"{url}/rename", json={"key": "Headcount", "new_key": "People"})

    dates = client.get(f"{url}/history", params={"key": "Dates"}).json()["entries"]
    people_count = client.get(f"{url}/history", params={"key": "People"}).json()["entries"]
    assert [(e["action"], e["value"], e["via"]) for e in dates] == [
        ("edit", "Dec 21-28", "web"),
        ("add", "Dec 20-27", "orbit-suggestion"),
    ]
    assert [(e["action"], e["key"]) for e in people_count] == [
        ("rename", "People"),
        ("add", "Headcount"),
    ]
