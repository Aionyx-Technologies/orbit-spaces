from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from orbit.runtime import Runtime
from tests.conftest import RecordingSender
from tests.rest_helpers import People, create_space, join

ALEX = "alex@example.com"
BLAKE = "blake@example.com"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def memory_url(space_id: str) -> str:
    return f"/api/spaces/{space_id}/memory"


def test_any_member_can_rename_a_fact_and_it_keeps_its_value(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, BLAKE, space["id"])
    url = memory_url(space["id"])
    people.as_(ALEX).put(url, json={"key": "Dates", "value": "Dec 20"})

    renamed = people.as_(BLAKE).post(f"{url}/rename", json={"key": "dates", "new_key": "Trip"})
    again = people.as_(BLAKE).post(f"{url}/rename", json={"key": "Trip", "new_key": "Trip"})

    assert renamed.status_code == 200
    body = renamed.json()
    assert body["changed"] is True
    assert body["replaced_value"] is None
    assert (body["fact"]["key"], body["fact"]["value"]) == ("Trip", "Dec 20")
    assert body["fact"]["set_by"]["display_name"] == "Blake"
    assert again.json()["changed"] is False
    detail = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()
    assert [(fact["key"], fact["value"]) for fact in detail["memory"]] == [("Trip", "Dec 20")]


def test_renames_report_missing_facts_and_taken_names(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)
    url = memory_url(space["id"])
    client.put(url, json={"key": "Budget", "value": "$3,000"})
    client.put(url, json={"key": "Cost", "value": "$2,000"})

    missing = client.post(f"{url}/rename", json={"key": "Nope", "new_key": "Other"})
    taken = client.post(f"{url}/rename", json={"key": "Cost", "new_key": "budget"})
    empty = client.post(f"{url}/rename", json={"key": "Cost", "new_key": " "})

    assert missing.status_code == 404
    assert missing.json() == {
        "error": {"code": "fact_not_found", "message": "There is no fact called “Nope”."}
    }
    assert taken.status_code == 409
    assert taken.json() == {
        "error": {
            "code": "fact_name_taken",
            "message": "There is already a fact called “budget”.",
        }
    }
    assert empty.status_code == 422


def test_any_member_can_delete_a_fact(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, BLAKE, space["id"])
    url = memory_url(space["id"])
    people.as_(ALEX).put(url, json={"key": "Budget", "value": "$3,000"})
    people.as_(ALEX).put(url, json={"key": "Dates", "value": "Dec 20"})

    deleted = people.as_(BLAKE).delete(url, params={"key": "budget"})
    again = people.as_(BLAKE).delete(url, params={"key": "budget"})
    nameless = people.as_(BLAKE).delete(url)

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert again.status_code == 404
    assert again.json()["error"]["code"] == "fact_not_found"
    assert nameless.status_code == 422
    detail = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()
    assert [fact["key"] for fact in detail["memory"]] == ["Dates"]


def test_the_history_lists_every_change_and_can_follow_one_fact(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, BLAKE, space["id"])
    url = memory_url(space["id"])
    people.as_(ALEX).put(url, json={"key": "Budget", "value": "$3,000"})
    people.as_(ALEX).put(url, json={"key": "Dates", "value": "Dec 20"})
    people.as_(BLAKE).put(url, json={"key": "Budget", "value": "$3,500"})
    people.as_(BLAKE).post(f"{url}/rename", json={"key": "Budget", "new_key": "Total"})
    people.as_(ALEX).delete(url, params={"key": "Dates"})

    everything = people.as_(BLAKE).get(f"{url}/history")
    one = people.as_(BLAKE).get(f"{url}/history", params={"key": "total"})
    missing = people.as_(BLAKE).get(f"{url}/history", params={"key": "Dates"})

    assert everything.status_code == 200
    entries = everything.json()["entries"]
    assert set(entries[0]) == {
        "action",
        "key",
        "previous_key",
        "value",
        "previous_value",
        "by",
        "via",
        "at",
    }
    assert [
        (e["action"], e["key"], e["previous_key"], e["value"], e["previous_value"]) for e in entries
    ] == [
        ("delete", "Dates", None, "Dec 20", None),
        ("rename", "Total", "Budget", "$3,500", None),
        ("edit", "Budget", None, "$3,500", "$3,000"),
        ("add", "Dates", None, "Dec 20", None),
        ("add", "Budget", None, "$3,000", None),
    ]
    assert entries[0]["by"]["display_name"] == "Alex"
    assert entries[0]["by"]["user_id"]
    assert entries[0]["via"] == "web"
    assert entries[0]["at"].endswith("Z") or "+00:00" in entries[0]["at"]
    assert [e["action"] for e in one.json()["entries"]] == ["rename", "edit", "add"]
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "fact_not_found"


def test_an_empty_space_has_an_empty_history(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)

    response = client.get(f"{memory_url(space['id'])}/history", params={"key": ""})

    assert response.status_code == 200
    assert response.json() == {"entries": []}
