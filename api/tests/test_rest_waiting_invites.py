from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from orbit.runtime import Runtime
from tests.conftest import FakeClock, RecordingSender
from tests.rest_helpers import People, create_space, join

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"
DANA = "dana@example.com"
UNKNOWN_ID = "0" * 32


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def invite(people: People, space_id: str, email: str | None, inviter: str = ALEX) -> str:
    response = people.as_(inviter).post(f"/api/spaces/{space_id}/invites", json={"email": email})
    assert response.status_code == 201, response.text
    return str(response.json()["url"]).rsplit("/", 1)[-1]


def waiting(people: People, space_id: str, viewer: str = ALEX) -> list[dict[str, Any]]:
    response = people.as_(viewer).get(f"/api/spaces/{space_id}")
    assert response.status_code == 200, response.text
    listed: list[dict[str, Any]] = response.json()["invites"]
    return listed


def test_an_emailed_invite_waits_in_the_space_until_it_is_accepted(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token = invite(people, space["id"], BLAKE)

    [row] = waiting(people, space["id"])
    assert row["email"] == BLAKE
    assert row["status"] == "pending"
    assert row["invited_by"] is not None

    accepted = people.as_(BLAKE).post(f"/api/invites/{token}/accept")
    assert accepted.status_code == 200, accepted.text
    assert waiting(people, space["id"]) == []


def test_a_link_without_an_address_is_not_listed(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite(people, space["id"], None)

    assert waiting(people, space["id"]) == []


def test_every_member_sees_who_is_waiting(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, CAROL, space["id"])
    invite(people, space["id"], BLAKE)

    assert [row["email"] for row in waiting(people, space["id"], viewer=CAROL)] == [BLAKE]


def test_an_outsider_cannot_see_the_waiting_list(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite(people, space["id"], BLAKE)

    assert people.as_(DANA).get(f"/api/spaces/{space['id']}").status_code in {403, 404}


def test_two_invites_to_one_address_show_once(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite(people, space["id"], BLAKE)
    invite(people, space["id"], BLAKE)

    assert len(waiting(people, space["id"])) == 1


def test_an_expired_invite_stays_listed_as_expired_for_a_while(
    people: People, clock: FakeClock
) -> None:
    space = create_space(people.as_(ALEX))
    invite(people, space["id"], BLAKE)

    clock.advance(days=8)
    [row] = waiting(people, space["id"])
    assert row["status"] == "expired"

    clock.advance(days=31)
    people.sign_in(ALEX)
    assert waiting(people, space["id"]) == []


def test_resending_emails_a_fresh_link_and_retires_the_old_one(
    people: People, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    space = create_space(people.as_(ALEX))
    old_token = invite(people, space["id"], BLAKE)
    clock.advance(days=8)
    [expired] = waiting(people, space["id"])

    response = people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites/{expired['id']}/resend")

    assert response.status_code == 201, response.text
    assert response.json()["emailed"] is True
    [fresh] = waiting(people, space["id"])
    assert fresh["status"] == "pending"
    assert fresh["id"] != expired["id"]
    runtime.env.mailer.drain()
    assert len([m for m in sender.to(BLAKE) if "invited you" in m.subject]) == 2
    old = people.as_(BLAKE).get(f"/api/invites/{old_token}")
    assert old.json()["status"] == "revoked"


def test_cancelling_removes_the_invite_and_its_link_stops_working(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token = invite(people, space["id"], BLAKE)
    [row] = waiting(people, space["id"])

    response = people.as_(ALEX).delete(f"/api/spaces/{space['id']}/invites/{row['id']}")

    assert response.status_code == 204
    assert waiting(people, space["id"]) == []
    assert people.as_(BLAKE).post(f"/api/invites/{token}/accept").status_code >= 400


def test_an_unknown_or_finished_invite_cannot_be_resent_or_cancelled(people: People) -> None:
    space = create_space(people.as_(ALEX))
    base = f"/api/spaces/{space['id']}/invites/{UNKNOWN_ID}"

    assert people.as_(ALEX).post(f"{base}/resend").status_code == 404
    assert people.as_(ALEX).delete(base).status_code == 404


def test_an_outsider_cannot_resend_or_cancel(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite(people, space["id"], BLAKE)
    [row] = waiting(people, space["id"])
    base = f"/api/spaces/{space['id']}/invites/{row['id']}"

    assert people.as_(DANA).post(f"{base}/resend").status_code in {403, 404}
    assert people.as_(DANA).delete(base).status_code in {403, 404}
    assert len(waiting(people, space["id"])) == 1
