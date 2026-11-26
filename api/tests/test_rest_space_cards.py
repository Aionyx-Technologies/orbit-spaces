from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from orbit.db import session_scope
from orbit.models import Item, User, new_id
from orbit.runtime import Runtime
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services.context import Actor
from tests.conftest import RecordingSender
from tests.rest_helpers import People, create_space, join, share
from tests.sql_helpers import counted_statements

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CARD_FIELDS = {
    "id",
    "name",
    "created_at",
    "is_creator",
    "notify_email",
    "members",
    "owner_name",
    "last_activity_at",
    "note_count",
    "fact_count",
    "has_plan",
    "highlights",
    "latest",
    "sources",
    "new_count",
}
LATEST_FIELDS = {"title", "kind", "via", "author_kind", "shared_by_name", "created_at"}


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def listed(people: People, email: str) -> list[dict[str, Any]]:
    response = people.as_(email).get("/api/spaces")
    assert response.status_code == 200, response.text
    spaces: list[dict[str, Any]] = response.json()["spaces"]
    return spaces


def card_named(people: People, email: str, name: str) -> dict[str, Any]:
    return next(space for space in listed(people, email) if space["name"] == name)


def user_id_of(people: People, email: str) -> str:
    return str(people.as_(email).get("/api/me").json()["id"])


def share_as_assistant(
    runtime: Runtime, user_id: str, client_name: str, space_id: str, title: str, content: str
) -> None:
    with session_scope(runtime.session_factory) as db:
        actor = Actor.assistant(user_id, client_name)
        items_service.share_item(db, runtime.env, actor, space_id, title, content)


def set_fact_as_assistant(
    runtime: Runtime, user_id: str, client_name: str, space_id: str, key: str, value: str
) -> None:
    with session_scope(runtime.session_factory) as db:
        actor = Actor.assistant(user_id, client_name)
        memory_service.set_fact(db, runtime.env, actor, space_id, key, value)


def add_plan(runtime: Runtime, space_id: str) -> None:
    with session_scope(runtime.session_factory) as db:
        db.add(
            Item(
                id=new_id(),
                space_id=space_id,
                kind="plan",
                title="Combined plan",
                content="PLAN BODY",
                author_kind="orbit",
                shared_by=None,
                via="orbit",
                source_item_ids=[],
                created_at=runtime.env.now(),
            )
        )
        db.commit()


def build_goa_trip(people: People, runtime: Runtime) -> dict[str, Any]:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    blake_id = user_id_of(people, BLAKE)
    share(people.as_(ALEX), space["id"], "Flights", "FLIGHT BODY")
    share_as_assistant(runtime, blake_id, "ChatGPT", space["id"], "Hotels", "HOTEL BODY")
    oops = share(people.as_(ALEX), space["id"], "Oops", "OOPS BODY")
    people.as_(ALEX).delete(f"/api/items/{oops['id']}")
    set_fact_as_assistant(runtime, blake_id, "Claude", space["id"], "Dates", "Dec 19")
    set_fact_as_assistant(runtime, blake_id, "Claude", space["id"], "Dates", "Dec 20 to 23")
    people.as_(ALEX).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Budget", "value": "$3,000"}
    )
    add_plan(runtime, space["id"])
    return space


def test_a_new_space_comes_back_with_an_empty_card(people: People) -> None:
    response = people.as_(ALEX).post("/api/spaces", json={"name": "Goa trip"})

    body = response.json()
    assert response.status_code == 201
    assert set(body) == CARD_FIELDS
    assert body["owner_name"] == "Alex"
    assert body["last_activity_at"] == body["created_at"]
    assert (body["note_count"], body["fact_count"], body["has_plan"]) == (0, 0, False)
    assert (body["highlights"], body["latest"], body["sources"]) == ([], None, [])


def test_a_space_with_nothing_in_it_has_an_empty_card_in_the_list_too(people: People) -> None:
    created = create_space(people.as_(ALEX), "Goa trip")

    [card] = listed(people, ALEX)

    assert set(card) == CARD_FIELDS
    assert card == created


def test_the_list_gives_each_space_a_card_with_the_new_fields(
    people: People, runtime: Runtime
) -> None:
    build_goa_trip(people, runtime)

    card = card_named(people, ALEX, "Goa trip")

    assert set(card) == CARD_FIELDS
    assert card["owner_name"] == "Alex"
    assert card["is_creator"] is True
    assert card["note_count"] == 2
    assert card["fact_count"] == 2
    assert card["has_plan"] is True
    assert card["highlights"] == [
        {"key": "Dates", "value": "Dec 20 to 23"},
        {"key": "Budget", "value": "$3,000"},
    ]
    assert set(card["latest"]) == LATEST_FIELDS
    assert {key: value for key, value in card["latest"].items() if key != "created_at"} == {
        "title": "Combined plan",
        "kind": "plan",
        "via": "orbit",
        "author_kind": "orbit",
        "shared_by_name": None,
    }
    assert card["last_activity_at"] == card["latest"]["created_at"]
    assert card["sources"] == ["Claude", "ChatGPT"]


def test_the_latest_note_names_who_shared_it_and_how(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    share(people.as_(ALEX), space["id"], "Flights", "Leaves at 7:10")
    share_as_assistant(
        runtime, user_id_of(people, BLAKE), "ChatGPT", space["id"], "Hotels", "Two options"
    )

    latest = card_named(people, ALEX, "Goa trip")["latest"]

    assert {key: value for key, value in latest.items() if key != "created_at"} == {
        "title": "Hotels",
        "kind": "note",
        "via": "ChatGPT",
        "author_kind": "assistant",
        "shared_by_name": "Blake",
    }


def test_every_member_sees_the_same_card_apart_from_being_the_creator(
    people: People, runtime: Runtime
) -> None:
    build_goa_trip(people, runtime)

    alex_card = card_named(people, ALEX, "Goa trip")
    blake_card = card_named(people, BLAKE, "Goa trip")

    assert (alex_card["is_creator"], blake_card["is_creator"]) == (True, False)
    assert blake_card["owner_name"] == "Alex"
    for key in CARD_FIELDS - {"is_creator", "members"}:
        assert alex_card[key] == blake_card[key], key


def test_item_content_never_appears_in_the_list_or_when_creating_a_space(
    people: People, runtime: Runtime
) -> None:
    build_goa_trip(people, runtime)
    created = people.as_(ALEX).post("/api/spaces", json={"name": "Another"})

    response = people.as_(ALEX).get("/api/spaces")

    for content in ("FLIGHT BODY", "HOTEL BODY", "PLAN BODY", "OOPS BODY"):
        assert content not in response.text
        assert content not in created.text
    assert "Oops" not in response.text


def test_highlights_use_the_same_order_as_the_space_page(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    url = f"/api/spaces/{space['id']}/memory"
    for key, value in [("Dates", "d1"), ("Budget", "b1"), ("Hotel", "h1"), ("Flights", "f1")]:
        people.as_(ALEX).put(url, json={"key": key, "value": value})
    people.as_(ALEX).put(url, json={"key": "dates", "value": "d2"})
    people.as_(ALEX).put(url, json={"key": "BUDGET", "value": "b2"})

    card = card_named(people, ALEX, "Goa trip")
    detail = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()

    shown = [(fact["key"], fact["value"]) for fact in detail["memory"]]
    assert [(h["key"], h["value"]) for h in card["highlights"]] == shown[:3]
    assert shown[:3] == [("Dates", "d2"), ("Budget", "b2"), ("Hotel", "h1")]
    assert card["fact_count"] == len(detail["memory"]) == 4


def test_a_creator_who_is_gone_leaves_the_owner_unnamed(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    with session_scope(runtime.session_factory) as db:
        db.execute(delete(User).where(User.email == ALEX))
        db.commit()

    card = card_named(people, BLAKE, "Goa trip")

    assert card["owner_name"] is None
    assert card["is_creator"] is False
    assert [member["display_name"] for member in card["members"]] == ["Blake"]


def test_cards_keep_their_numbers_apart_and_ignore_spaces_you_are_not_in(
    people: People, runtime: Runtime
) -> None:
    alex_id = user_id_of(people, ALEX)
    blake_id = user_id_of(people, BLAKE)
    first = create_space(people.as_(ALEX), "First")
    second = create_space(people.as_(ALEX), "Second")
    private = create_space(people.as_(BLAKE), "Blake only")
    share_as_assistant(runtime, alex_id, "ChatGPT", first["id"], "One", "Body")
    set_fact_as_assistant(runtime, alex_id, "ChatGPT", first["id"], "Dates", "Dec 20")
    share_as_assistant(runtime, alex_id, "Claude", second["id"], "Two", "Body")
    share_as_assistant(runtime, alex_id, "Claude", second["id"], "Three", "Body")
    share_as_assistant(runtime, blake_id, "Grok", private["id"], "Hidden", "Body")

    cards = {card["name"]: card for card in listed(people, ALEX)}

    assert set(cards) == {"First", "Second"}
    assert (cards["First"]["note_count"], cards["First"]["fact_count"]) == (1, 1)
    assert (cards["Second"]["note_count"], cards["Second"]["fact_count"]) == (2, 0)
    assert cards["First"]["sources"] == ["ChatGPT"]
    assert cards["Second"]["sources"] == ["Claude"]
    assert cards["First"]["latest"]["title"] == "One"
    assert cards["Second"]["latest"]["title"] == "Three"
    assert "Hidden" not in str(cards)
    assert "Grok" not in str(cards)


def test_the_list_runs_the_same_number_of_queries_however_many_spaces_there_are(
    people: People, runtime: Runtime
) -> None:
    alex_id = user_id_of(people, ALEX)

    def add_spaces(first: int, count: int) -> None:
        for index in range(first, first + count):
            space = create_space(people.as_(ALEX), f"Space {index}")
            share_as_assistant(runtime, alex_id, "ChatGPT", space["id"], f"Note {index}", "Body")
            set_fact_as_assistant(runtime, alex_id, "Claude", space["id"], "Dates", f"Day {index}")
            if index % 2:
                add_plan(runtime, space["id"])

    def statements_for_the_list() -> list[str]:
        client = people.as_(ALEX)
        with counted_statements(runtime.engine) as statements:
            assert client.get("/api/spaces").status_code == 200
        return statements

    add_spaces(0, 2)
    few = statements_for_the_list()
    add_spaces(2, 10)
    many = statements_for_the_list()

    assert len(listed(people, ALEX)) == 12
    assert len(many) == len(few) > 0
