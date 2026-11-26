from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.db import session_scope
from orbit.limits import INVITE_EMAILS_PER_USER
from orbit.models import Space, SpaceMember
from orbit.runtime import Runtime
from tests.conftest import FakeClock, RecordingSender
from tests.oauth_helpers import (
    authorize_url,
    connect,
    exchange,
    make_pkce,
    mcp_rpc,
    query_of,
    register,
    run_consent,
)
from tests.rest_helpers import People, create_space, fill_space, join

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def make_invite(people: People, space_id: str, **body: str) -> tuple[str, dict[str, object]]:
    response = people.as_(ALEX).post(f"/api/spaces/{space_id}/invites", json=body)
    assert response.status_code == 201, response.text
    created: dict[str, object] = response.json()
    return str(created["url"]).rsplit("/", 1)[-1], created


def test_a_link_invite_brings_a_second_person_into_the_space(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token, created = make_invite(people, space["id"])

    assert str(created["url"]) == f"https://orbit.test/invite/{token}"
    assert created["emailed"] is False

    preview = people.anonymous().get(f"/api/invites/{token}").json()
    assert preview == {
        "status": "valid",
        "space_name": "Goa trip",
        "invited_by": "Alex",
        "expires_at": created["expires_at"],
        "signed_in": False,
        "already_member": False,
        "inviter_avatar_url": None,
    }

    people.sign_in(BLAKE, next_path=f"/invite/{token}")
    blake = people.as_(BLAKE)
    assert blake.get(f"/api/invites/{token}").json()["signed_in"] is True
    accepted = blake.post(f"/api/invites/{token}/accept")
    assert accepted.json() == {"space_id": space["id"], "already_member": False}

    assert blake.get(f"/api/spaces/{space['id']}").status_code == 200
    members = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()["members"]
    assert [member["display_name"] for member in members] == ["Alex", "Blake"]
    with session_scope(runtime.session_factory) as db:
        assert len(db.scalars(select(SpaceMember)).all()) == 2


def test_accepting_again_just_says_you_are_already_in(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    blake = people.as_(BLAKE)
    blake.post(f"/api/invites/{token}/accept")

    again = blake.post(f"/api/invites/{token}/accept")
    preview = blake.get(f"/api/invites/{token}").json()

    assert again.status_code == 200
    assert again.json() == {"space_id": space["id"], "already_member": True}
    assert preview["already_member"] is True


def test_an_invite_works_for_one_person_only(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    assert people.as_(BLAKE).post(f"/api/invites/{token}/accept").status_code == 200

    second = people.as_(CAROL).post(f"/api/invites/{token}/accept")
    preview = people.as_(CAROL).get(f"/api/invites/{token}").json()

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "invite_unusable"
    assert second.json()["error"]["message"] == "This invite was already used. Ask for a new one."
    assert preview["status"] == "used"
    assert people.as_(CAROL).get(f"/api/spaces/{space['id']}").status_code == 403


def test_an_invite_expires_after_seven_days(people: People, clock: FakeClock) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    people.as_(BLAKE)
    clock.advance(days=8)

    preview = people.as_(BLAKE).get(f"/api/invites/{token}").json()
    accepted = people.as_(BLAKE).post(f"/api/invites/{token}/accept")

    assert preview["status"] == "expired"
    assert accepted.status_code == 409
    assert accepted.json()["error"]["message"] == "This invite has expired. Ask for a new one."


def test_an_unknown_invite_is_not_found(people: People) -> None:
    response = people.anonymous().get("/api/invites/not-a-real-token")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invite_not_found"


def test_an_invite_to_a_deleted_space_is_gone(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    people.as_(ALEX).delete(f"/api/spaces/{space['id']}")

    assert people.anonymous().get(f"/api/invites/{token}").status_code == 404
    assert people.as_(BLAKE).post(f"/api/invites/{token}/accept").status_code == 404


def test_only_members_can_create_invites(people: People) -> None:
    space = create_space(people.as_(ALEX))

    response = people.as_(BLAKE).post(f"/api/spaces/{space['id']}/invites", json={})

    assert response.status_code == 403


def test_an_invite_can_be_emailed_and_the_link_matches(
    people: People, sender: RecordingSender
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")

    created = people.as_(ALEX).post(
        f"/api/spaces/{space['id']}/invites", json={"email": " Blake@Example.com "}
    )
    people.runtime.env.mailer.drain()

    assert created.json()["emailed"] is True
    [message] = sender.to(BLAKE)
    assert message.subject == "Alex invited you to Goa trip on Orbit"
    assert created.json()["url"] in message.text
    assert "expires in 7 days" in message.text
    assert message.html is not None
    assert created.json()["url"] in message.html


def test_a_bad_invite_address_is_rejected_without_creating_anything(
    people: People, sender: RecordingSender, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))

    response = people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={"email": "nope"})

    assert response.status_code == 422
    assert sender.to("nope") == []


def test_emailing_invites_is_rate_limited_per_person(people: People) -> None:
    space = create_space(people.as_(ALEX))
    allowed, _window = INVITE_EMAILS_PER_USER
    for index in range(allowed):
        sent = people.as_(ALEX).post(
            f"/api/spaces/{space['id']}/invites", json={"email": f"guest{index}@example.com"}
        )
        assert sent.status_code == 201

    blocked = people.as_(ALEX).post(
        f"/api/spaces/{space['id']}/invites", json={"email": "one-more@example.com"}
    )
    plain = people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={})

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert plain.status_code == 201


def test_a_space_holds_at_most_ten_people(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    fill_space(runtime, space["id"], 9)

    full = people.as_(BLAKE).post(f"/api/invites/{token}/accept")
    another = people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={})

    assert full.status_code == 409
    assert full.json()["error"]["code"] == "limit_reached"
    assert another.status_code == 409
    assert "10 people" in another.json()["error"]["message"]


def test_nine_people_can_still_take_the_last_seat(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    fill_space(runtime, space["id"], 8)

    assert people.as_(BLAKE).post(f"/api/invites/{token}/accept").status_code == 200


def test_a_person_can_belong_to_at_most_fifty_spaces(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX))
    token, _ = make_invite(people, space["id"])
    blake = people.as_(BLAKE)
    for index in range(50):
        create_space(blake, f"Space {index}")

    response = blake.post(f"/api/invites/{token}/accept")

    assert response.status_code == 409
    assert "50 spaces" in response.json()["error"]["message"]
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(Space).where(Space.name == "")).all() == []


def test_connected_assistants_are_listed_and_can_be_revoked(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender, name="ChatGPT")

    listed = client.get("/api/connections").json()["connections"]
    gone = client.delete(f"/api/connections/{listed[0]['id']}")

    assert [(c["client_name"], c["client_host"]) for c in listed] == [("ChatGPT", "chatgpt.test")]
    assert gone.status_code == 204
    assert client.get("/api/connections").json()["connections"] == []
    assert mcp_rpc(client, tokens["access_token"], "tools/list").status_code == 401


def test_revoking_a_connection_also_cancels_codes_that_were_not_exchanged_yet(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client, name="ChatGPT")
    first = make_pkce()
    consent = run_consent(client, runtime, sender, authorize_url(registered["client_id"], first))
    first_code = query_of(consent.headers["location"])["code"]
    assert exchange(client, registered["client_id"], first_code, first.verifier).status_code == 200
    second = make_pkce()
    pending = run_consent(client, runtime, sender, authorize_url(registered["client_id"], second))
    pending_code = query_of(pending.headers["location"])["code"]
    listed = client.get("/api/connections").json()["connections"]

    assert client.delete(f"/api/connections/{listed[0]['id']}").status_code == 204
    late = exchange(client, registered["client_id"], pending_code, second.verifier)

    assert late.status_code == 400
    assert client.get("/api/connections").json()["connections"] == []


def test_you_cannot_revoke_someone_elses_connection(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    connect(client, runtime, sender, name="ChatGPT", email=ALEX)
    alex_connection = client.get("/api/connections").json()["connections"][0]["id"]
    client.cookies.clear()
    connect(client, runtime, sender, name="Claude", email=BLAKE)

    response = client.delete(f"/api/connections/{alex_connection}")

    assert response.status_code == 404
    assert [c["client_name"] for c in client.get("/api/connections").json()["connections"]] == [
        "Claude"
    ]


def test_joining_helper_matches_the_public_flow(people: People) -> None:
    space = create_space(people.as_(ALEX))

    join(people, ALEX, BLAKE, space["id"])

    detail = people.as_(BLAKE).get(f"/api/spaces/{space['id']}").json()
    assert [member["display_name"] for member in detail["members"]] == ["Alex", "Blake"]
