from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from orbit.runtime import Runtime
from tests.conftest import RecordingSender
from tests.rest_helpers import People, create_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def new_count(people: People, email: str, space_id: str) -> int:
    response = people.as_(email).get("/api/spaces")
    assert response.status_code == 200, response.text
    spaces: list[dict[str, Any]] = response.json()["spaces"]
    return int(next(space for space in spaces if space["id"] == space_id)["new_count"])


def mark_read(people: People, email: str, space_id: str) -> int:
    return people.as_(email).post(f"/api/spaces/{space_id}/read").status_code


def shared_space(people: People) -> str:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    return str(space["id"])


def test_a_card_counts_what_others_shared_since_the_person_last_looked(people: People) -> None:
    space_id = shared_space(people)
    assert mark_read(people, ALEX, space_id) == 204

    share(people.as_(BLAKE), space_id, "Hotels")
    share(people.as_(BLAKE), space_id, "Flights")

    assert new_count(people, ALEX, space_id) == 2
    assert new_count(people, BLAKE, space_id) == 0


def test_opening_the_space_marks_it_read(people: People) -> None:
    space_id = shared_space(people)
    mark_read(people, ALEX, space_id)
    share(people.as_(BLAKE), space_id, "Hotels")

    assert mark_read(people, ALEX, space_id) == 204

    assert new_count(people, ALEX, space_id) == 0


def test_a_space_nobody_has_looked_at_yet_counts_nothing_as_new(people: People) -> None:
    space_id = shared_space(people)
    share(people.as_(BLAKE), space_id, "Hotels")

    assert new_count(people, ALEX, space_id) == 0


def test_a_persons_own_shares_do_not_count(people: People) -> None:
    space_id = shared_space(people)
    mark_read(people, ALEX, space_id)

    share(people.as_(ALEX), space_id, "Flights")

    assert new_count(people, ALEX, space_id) == 0


def test_only_the_explicit_read_call_marks_a_space_read(people: People) -> None:
    space_id = shared_space(people)
    mark_read(people, ALEX, space_id)
    share(people.as_(BLAKE), space_id, "Hotels")

    detail = people.as_(ALEX).get(f"/api/spaces/{space_id}")

    assert detail.status_code == 200
    assert new_count(people, ALEX, space_id) == 1


def test_a_new_space_starts_with_nothing_new(people: People) -> None:
    created = people.as_(ALEX).post("/api/spaces", json={"name": "Goa trip"})

    assert created.status_code == 201
    assert created.json()["new_count"] == 0


def test_marking_read_is_for_members_only(people: People) -> None:
    space_id = shared_space(people)

    assert mark_read(people, CAROL, space_id) == 403
    assert mark_read(people, ALEX, "no-such-space") == 404


def test_marking_read_needs_a_signed_in_person(people: People) -> None:
    space_id = shared_space(people)

    response = people.anonymous().post(f"/api/spaces/{space_id}/read")

    assert response.status_code == 401
