from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.db import session_scope
from orbit.models import Item, Memory, Space, SpaceMember, User, WebSession
from orbit.runtime import Runtime
from tests.conftest import RecordingSender
from tests.rest_helpers import People, create_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
FOREIGN = {"Origin": "https://evil.example"}

AUTH_REQUIRED: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/me", None),
    ("PATCH", "/api/me", {"display_name": "X"}),
    ("DELETE", "/api/me", None),
    ("GET", "/api/spaces", None),
    ("POST", "/api/spaces", {"name": "X"}),
    ("GET", "/api/spaces/x", None),
    ("DELETE", "/api/spaces/x", None),
    ("PATCH", "/api/spaces/x/membership", {"notify_email": False}),
    ("GET", "/api/spaces/x/items", None),
    ("POST", "/api/spaces/x/items", {"title": "t", "content": "c"}),
    ("DELETE", "/api/items/x", None),
    ("PUT", "/api/spaces/x/memory", {"key": "k", "value": "v"}),
    ("POST", "/api/spaces/x/memory/rename", {"key": "k", "new_key": "n"}),
    ("DELETE", "/api/spaces/x/memory?key=k", None),
    ("GET", "/api/spaces/x/memory/history", None),
    ("POST", "/api/spaces/x/invites", {}),
    ("POST", "/api/invites/x/accept", None),
    ("GET", "/api/invitations", None),
    ("POST", "/api/invitations/x/accept", None),
    ("POST", "/api/invitations/x/decline", None),
    ("GET", "/api/connections", None),
    ("DELETE", "/api/connections/x", None),
    ("GET", "/api/spaces/x/events", None),
    ("GET", "/api/spaces/x/export", None),
]


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


@pytest.mark.parametrize(("method", "path", "body"), AUTH_REQUIRED)
def test_every_route_needs_a_session(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = client.request(method, path, json=body)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [row for row in AUTH_REQUIRED if row[0] != "GET"],
)
def test_every_write_needs_the_sites_own_origin(
    people: People, method: str, path: str, body: dict[str, Any] | None
) -> None:
    client = people.as_(ALEX)

    foreign = client.request(method, path, json=body, headers=FOREIGN)
    nothing = client.request(method, path, json=body, headers={"Origin": ""})

    assert foreign.status_code == 403
    assert foreign.json()["error"]["code"] == "forbidden"
    assert nothing.status_code == 403


def test_reads_do_not_need_an_origin(people: People) -> None:
    client = people.as_(ALEX)

    response = client.get("/api/me", headers={"Origin": ""})

    assert response.status_code == 200


def test_me_reports_the_person_and_what_this_server_offers(people: People) -> None:
    response = people.as_(ALEX).get("/api/me")

    body = response.json()
    assert response.status_code == 200
    assert body["email"] == ALEX
    assert body["display_name"] == "Alex"
    assert body["mcp_url"] == "https://orbit.test/mcp"
    assert body["combine_enabled"] is False


def test_a_person_can_rename_themselves(people: People) -> None:
    client = people.as_(ALEX)

    renamed = client.patch("/api/me", json={"display_name": "  Alex   Smith "})
    empty = client.patch("/api/me", json={"display_name": "  "})

    assert renamed.json()["display_name"] == "Alex Smith"
    assert client.get("/api/me").json()["display_name"] == "Alex Smith"
    assert empty.status_code == 422
    assert empty.json()["error"] == {"code": "invalid_input", "message": "Name cannot be empty."}


def test_deleting_the_account_signs_the_person_out_and_removes_them(
    people: People, runtime: Runtime
) -> None:
    client = people.as_(ALEX)

    response = client.delete("/api/me")

    assert response.status_code == 204
    assert "orbit_session" in response.headers["set-cookie"]
    assert client.get("/api/me").status_code == 401
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(User).where(User.email == ALEX)).first() is None
        assert db.scalars(select(WebSession)).all() == []


def test_creating_a_space_returns_it_with_you_as_the_creator(people: People) -> None:
    client = people.as_(ALEX)

    response = client.post("/api/spaces", json={"name": "  Goa   trip "})

    body = response.json()
    assert response.status_code == 201
    assert body["name"] == "Goa trip"
    assert body["is_creator"] is True
    assert body["notify_email"] is True
    assert [(m["display_name"], m["is_you"]) for m in body["members"]] == [("Alex", True)]


def test_the_spaces_list_reports_no_cap_by_default(people: People) -> None:
    client = people.as_(ALEX)
    create_space(client, "Goa trip")

    body = client.get("/api/spaces").json()

    assert body["limits"] == {"created_spaces": 1, "max_created_spaces": None}


def test_the_spaces_list_reports_the_created_cap_and_how_much_is_used(
    people: People, runtime: Runtime
) -> None:
    runtime.env.settings.max_created_spaces = 2
    alex = people.as_(ALEX)
    space = create_space(alex, "Goa trip")
    join(people, ALEX, BLAKE, space["id"])

    mine = people.as_(ALEX).get("/api/spaces").json()["limits"]
    theirs = people.as_(BLAKE).get("/api/spaces").json()["limits"]

    assert mine == {"created_spaces": 1, "max_created_spaces": 2}
    assert theirs == {"created_spaces": 0, "max_created_spaces": 2}


def test_space_names_are_validated(people: People) -> None:
    client = people.as_(ALEX)

    empty = client.post("/api/spaces", json={"name": "  "})
    long = client.post("/api/spaces", json={"name": "x" * 101})
    malformed = client.post(
        "/api/spaces", content="not json", headers={"Content-Type": "application/json"}
    )

    assert empty.status_code == 422
    assert empty.json()["error"]["message"] == "Space name cannot be empty."
    assert long.status_code == 422
    assert long.json()["error"]["code"] == "too_long"
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "invalid_input"


def test_the_list_shows_only_your_spaces_newest_first(people: People) -> None:
    client = people.as_(ALEX)
    first = create_space(client, "First")
    second = create_space(client, "Second")
    create_space(people.as_(BLAKE), "Blakes own")

    listed = people.as_(ALEX).get("/api/spaces").json()["spaces"]

    assert [space["id"] for space in listed] == [second["id"], first["id"]]


def test_the_space_detail_has_members_memory_and_no_plan_yet(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)
    join(people, ALEX, BLAKE, space["id"])
    people.as_(BLAKE).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Dates", "value": "Dec 20"}
    )

    detail = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()

    assert detail["is_creator"] is True
    assert [(m["display_name"], m["is_you"]) for m in detail["members"]] == [
        ("Alex", True),
        ("Blake", False),
    ]
    assert detail["memory"][0]["key"] == "Dates"
    assert detail["memory"][0]["set_by"]["display_name"] == "Blake"
    assert detail["memory"][0]["via"] == "web"
    assert detail["latest_plan"] is None
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").json()["is_creator"] is False


def test_nobody_outside_a_space_can_touch_it(people: People) -> None:
    space = create_space(people.as_(ALEX))
    item = share(people.as_(ALEX), space["id"], "Mine")
    outsider = people.as_(BLAKE)
    sid = space["id"]

    attempts = [
        outsider.get(f"/api/spaces/{sid}"),
        outsider.get(f"/api/spaces/{sid}/items"),
        outsider.post(f"/api/spaces/{sid}/items", json={"title": "T", "content": "C"}),
        outsider.put(f"/api/spaces/{sid}/memory", json={"key": "K", "value": "V"}),
        outsider.post(f"/api/spaces/{sid}/memory/rename", json={"key": "K", "new_key": "N"}),
        outsider.delete(f"/api/spaces/{sid}/memory", params={"key": "K"}),
        outsider.get(f"/api/spaces/{sid}/memory/history"),
        outsider.post(f"/api/spaces/{sid}/invites", json={}),
        outsider.get(f"/api/spaces/{sid}/export"),
        outsider.patch(f"/api/spaces/{sid}/membership", json={"notify_email": False}),
        outsider.delete(f"/api/spaces/{sid}"),
    ]

    for attempt in attempts:
        assert attempt.status_code == 403
        assert attempt.json()["error"]["code"] == "not_a_member"
    assert outsider.delete(f"/api/items/{item['id']}").status_code == 404


def test_an_unknown_space_is_not_found(people: People) -> None:
    response = people.as_(ALEX).get("/api/spaces/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "space_not_found"


def test_only_the_creator_can_delete_a_space_and_it_takes_its_content_with_it(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Doomed")
    join(people, ALEX, BLAKE, space["id"])
    share(people.as_(ALEX), space["id"], "Secret", "Do not keep")
    people.as_(ALEX).put(f"/api/spaces/{space['id']}/memory", json={"key": "K", "value": "V"})

    refused = people.as_(BLAKE).delete(f"/api/spaces/{space['id']}")
    deleted = people.as_(ALEX).delete(f"/api/spaces/{space['id']}")

    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "forbidden"
    assert deleted.status_code == 204
    assert people.as_(ALEX).get(f"/api/spaces/{space['id']}").status_code == 404
    assert people.as_(BLAKE).get("/api/spaces").json()["spaces"] == []
    with session_scope(runtime.session_factory) as db:
        row = db.get(Space, space["id"])
        assert row is not None
        assert row.deleted_at is not None
        assert row.name == ""
        assert db.scalars(select(Item)).all() == []
        assert db.scalars(select(Memory)).all() == []
        assert db.scalars(select(SpaceMember)).all() == []


def test_email_notifications_can_be_switched_per_space(people: People) -> None:
    client = people.as_(ALEX)
    one = create_space(client, "One")
    two = create_space(client, "Two")

    off = client.patch(f"/api/spaces/{one['id']}/membership", json={"notify_email": False})
    listed = {
        space["id"]: space["notify_email"] for space in client.get("/api/spaces").json()["spaces"]
    }
    detail = client.get(f"/api/spaces/{one['id']}").json()

    assert off.json() == {"notify_email": False}
    assert listed == {one["id"]: False, two["id"]: True}
    assert detail["notify_email"] is False


def test_sharing_from_the_web_records_who_how_and_lets_only_you_retract(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, BLAKE, space["id"])

    item = share(people.as_(ALEX), space["id"], "Flight", "Leaves at 7:10")

    assert item["kind"] == "note"
    assert item["author_kind"] == "person"
    assert item["via"] == "web"
    assert item["shared_by"]["display_name"] == "Alex"
    assert item["can_retract"] is True
    seen_by_blake = people.as_(BLAKE).get(f"/api/spaces/{space['id']}/items").json()["items"][0]
    assert seen_by_blake["id"] == item["id"]
    assert seen_by_blake["can_retract"] is False


def test_sharing_is_validated_with_friendly_messages(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)
    url = f"/api/spaces/{space['id']}/items"

    no_title = client.post(url, json={"title": " ", "content": "x"})
    no_body = client.post(url, json={"title": "x", "content": ""})
    too_big = client.post(url, json={"title": "x", "content": "y" * 20_001})

    assert no_title.json()["error"]["message"] == "Title cannot be empty."
    assert no_body.json()["error"]["message"] == "Content cannot be empty."
    assert too_big.status_code == 422
    assert (
        too_big.json()["error"]["message"] == "Content is too long. The limit is 20,000 characters."
    )


def test_the_feed_pages_newest_first(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)
    ids = [share(client, space["id"], f"Item {n}")["id"] for n in range(5)]
    url = f"/api/spaces/{space['id']}/items"

    first = client.get(url, params={"limit": 2}).json()
    second = client.get(url, params={"limit": 2, "before": first["next_before"]}).json()
    last = client.get(url, params={"limit": 2, "before": second["next_before"]}).json()

    assert [item["id"] for item in first["items"]] == [ids[4], ids[3]]
    assert [item["id"] for item in second["items"]] == [ids[2], ids[1]]
    assert [item["id"] for item in last["items"]] == [ids[0]]
    assert last["next_before"] is None
    assert client.get(url, params={"before": "nonsense"}).status_code == 422


def test_retracting_hides_the_item_and_scrubs_it(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, BLAKE, space["id"])
    item = share(people.as_(ALEX), space["id"], "Oops", "Wrong thing")

    refused = people.as_(BLAKE).delete(f"/api/items/{item['id']}")
    done = people.as_(ALEX).delete(f"/api/items/{item['id']}")
    again = people.as_(ALEX).delete(f"/api/items/{item['id']}")

    assert refused.status_code == 403
    assert done.status_code == 204
    assert again.status_code == 404
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}/items").json()["items"] == []
    with session_scope(runtime.session_factory) as db:
        row = db.get(Item, item["id"])
        assert row is not None
        assert (row.title, row.content) == ("", "")


def test_setting_a_fact_replaces_or_reports_no_change(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client)
    url = f"/api/spaces/{space['id']}/memory"

    first = client.put(url, json={"key": "Budget", "value": "$3,000"}).json()
    second = client.put(url, json={"key": "budget", "value": "$3,500"}).json()
    same = client.put(url, json={"key": "Budget", "value": "$3,500"}).json()
    empty = client.put(url, json={"key": "Budget", "value": " "})

    assert first["changed"] is True
    assert first["replaced_value"] is None
    assert second["replaced_value"] == "$3,000"
    assert second["fact"]["key"] == "Budget"
    assert same["changed"] is False
    assert empty.status_code == 422
    detail = client.get(f"/api/spaces/{space['id']}").json()
    assert [(f["key"], f["value"]) for f in detail["memory"]] == [("Budget", "$3,500")]


def test_the_export_is_a_json_download_without_anyones_email(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client, "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    share(people.as_(BLAKE), space["id"], "Hotels", "Three options")
    people.as_(ALEX).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Dates", "value": "Dec 20"}
    )
    retracted = share(people.as_(ALEX), space["id"], "Oops", "Mistake")
    people.as_(ALEX).delete(f"/api/items/{retracted['id']}")

    response = people.as_(ALEX).get(f"/api/spaces/{space['id']}/export")

    body = response.json()
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="orbit-goa-trip.json"'
    assert body["space"]["name"] == "Goa trip"
    assert [item["title"] for item in body["items"]] == ["Hotels"]
    assert body["items"][0]["shared_by"] == "Blake"
    assert [fact["key"] for fact in body["memory"]["current"]] == ["Dates"]
    assert [member["display_name"] for member in body["members"]] == ["Alex", "Blake"]
    assert "@" not in response.text
    assert "Oops" not in response.text


def test_the_api_is_not_cacheable_by_default_and_errors_share_one_shape(people: People) -> None:
    client = people.as_(ALEX)

    missing = client.get("/api/spaces/nope")

    assert set(missing.json()) == {"error"}
    assert set(missing.json()["error"]) == {"code", "message"}
