from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from orbit.db import session_scope
from orbit.events import MEMBER_JOINED, SpaceEvent
from orbit.limits import INVITE_TTL
from orbit.models import Invite, Space, User
from orbit.runtime import Runtime
from orbit.security import hash_token
from orbit.services import invites as invites_service
from tests.conftest import FakeClock, RecordingSender
from tests.rest_helpers import People, create_space, fill_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"
UNTOUCHED = {"accepted_by": None, "accepted_at": None, "revoked_at": None}
UNKNOWN_ID = "0" * 32


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def invite_by_email(people: People, space_id: str, email: str, inviter: str = ALEX) -> str:
    response = people.as_(inviter).post(f"/api/spaces/{space_id}/invites", json={"email": email})
    assert response.status_code == 201, response.text
    return str(response.json()["url"]).rsplit("/", 1)[-1]


def pending(people: People, email: str) -> list[dict[str, Any]]:
    response = people.as_(email).get("/api/invitations")
    assert response.status_code == 200, response.text
    listed: list[dict[str, Any]] = response.json()["invitations"]
    return listed


def only_invitation_id(people: People, email: str) -> str:
    [invitation] = pending(people, email)
    return str(invitation["id"])


def stored_invite(runtime: Runtime, token: str) -> dict[str, Any]:
    with session_scope(runtime.session_factory) as db:
        invite = db.get(Invite, hash_token(token))
        assert invite is not None
        return {
            "accepted_by": invite.accepted_by,
            "accepted_at": invite.accepted_at,
            "revoked_at": invite.revoked_at,
        }


def user_id_of(people: People, email: str) -> str:
    return str(people.as_(email).get("/api/me").json()["id"])


def test_only_the_addressee_sees_a_pending_invitation(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    invite_by_email(people, space["id"], BLAKE)
    people.as_(CAROL)

    assert [row["space_name"] for row in pending(people, BLAKE)] == ["Goa trip"]
    assert pending(people, CAROL) == []
    assert pending(people, ALEX) == []


def test_a_member_of_the_same_space_does_not_see_an_invitation_meant_for_someone_else(
    people: People,
) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, CAROL, space["id"])
    invite_by_email(people, space["id"], BLAKE)

    assert pending(people, CAROL) == []
    assert len(pending(people, BLAKE)) == 1


def test_plain_share_links_are_never_listed(people: People) -> None:
    space = create_space(people.as_(ALEX))
    for body in ({}, {"email": ""}, {"email": "   "}):
        response = people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json=body)
        assert response.status_code == 201
    people.as_(BLAKE)

    assert pending(people, BLAKE) == []
    assert pending(people, ALEX) == []


def test_the_address_is_matched_after_trimming_and_lowercasing(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    invite_by_email(people, space["id"], "  Blake@Example.COM ")

    assert [row["space_name"] for row in pending(people, BLAKE)] == ["Goa trip"]


@pytest.mark.parametrize(
    "other_address",
    ["blake+work@example.com", "blake@example.org", "blak@example.com", "xblake@example.com"],
)
def test_only_the_exact_address_matches(people: People, other_address: str) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], other_address)
    people.as_(BLAKE)

    assert pending(people, BLAKE) == []


def test_expired_invitations_are_not_listed(people: People, clock: FakeClock) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    assert len(pending(people, BLAKE)) == 1

    clock.advance(days=8)

    assert pending(people, BLAKE) == []


def test_an_invitation_stops_being_listed_at_the_moment_it_expires(
    people: People, runtime: Runtime, clock: FakeClock
) -> None:
    space = create_space(people.as_(ALEX))
    created = (
        people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={"email": BLAKE}).json()
    )
    people.as_(BLAKE)
    expires_at = datetime.fromisoformat(created["expires_at"])

    with session_scope(runtime.session_factory) as db:
        blake = db.scalar(select(User).where(User.email == BLAKE))
        assert blake is not None
        clock.current = expires_at - timedelta(seconds=1)
        just_before = invites_service.list_pending_invitations(db, runtime.env, blake)
        clock.current = expires_at
        at_expiry = invites_service.list_pending_invitations(db, runtime.env, blake)

    assert len(just_before) == 1
    assert at_expiry == []


def test_revoked_invitations_are_not_listed(people: People) -> None:
    space = create_space(people.as_(ALEX))
    join(people, ALEX, CAROL, space["id"])
    invite_by_email(people, space["id"], BLAKE)
    assert len(pending(people, BLAKE)) == 1

    assert people.as_(ALEX).delete("/api/me").status_code == 204

    assert pending(people, BLAKE) == []


def test_accepted_invitations_are_not_listed(people: People) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    people.as_(BLAKE)

    assert people.as_(CAROL).post(f"/api/invites/{token}/accept").status_code == 200

    assert pending(people, BLAKE) == []


def test_invitations_to_deleted_spaces_are_not_listed(people: People, runtime: Runtime) -> None:
    kept = create_space(people.as_(ALEX), "Kept")
    soft_deleted = create_space(people.as_(ALEX), "Soft deleted")
    removed = create_space(people.as_(ALEX), "Removed")
    for space in (kept, soft_deleted, removed):
        invite_by_email(people, space["id"], BLAKE)
    with session_scope(runtime.session_factory) as db:
        row = db.get(Space, soft_deleted["id"])
        assert row is not None
        row.deleted_at = runtime.env.now()
        db.commit()
    assert people.as_(ALEX).delete(f"/api/spaces/{removed['id']}").status_code == 204

    assert [row["space_name"] for row in pending(people, BLAKE)] == ["Kept"]


def test_invitations_to_spaces_you_already_belong_to_are_not_listed(people: People) -> None:
    joined = create_space(people.as_(ALEX), "Goa trip")
    waiting = create_space(people.as_(ALEX), "Lisbon")
    invite_by_email(people, joined["id"], BLAKE)
    invite_by_email(people, waiting["id"], BLAKE)
    join(people, ALEX, BLAKE, joined["id"])

    assert [row["space_name"] for row in pending(people, BLAKE)] == ["Lisbon"]


def test_the_newest_invitation_comes_first(people: People, clock: FakeClock) -> None:
    first = create_space(people.as_(ALEX), "First")
    second = create_space(people.as_(CAROL), "Second")
    third = create_space(people.as_(ALEX), "Third")
    invite_by_email(people, first["id"], BLAKE, ALEX)
    clock.advance(hours=1)
    invite_by_email(people, second["id"], BLAKE, CAROL)
    clock.advance(hours=1)
    invite_by_email(people, third["id"], BLAKE, ALEX)

    listed = pending(people, BLAKE)

    assert [row["space_name"] for row in listed] == ["Third", "Second", "First"]
    moments = [datetime.fromisoformat(row["invited_at"]) for row in listed]
    assert moments == sorted(moments, reverse=True)


def test_an_invitation_says_who_invited_you_and_when(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    created = (
        people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={"email": BLAKE}).json()
    )

    [invitation] = pending(people, BLAKE)

    sent_at = datetime.fromisoformat(created["expires_at"]) - INVITE_TTL
    assert invitation["space_name"] == "Goa trip"
    assert invitation["invited_by"] == "Alex"
    assert invitation["expires_at"] == created["expires_at"]
    assert datetime.fromisoformat(invitation["invited_at"]) == sent_at


def test_the_inviter_shows_as_nobody_once_their_account_is_gone(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    invite_by_email(people, space["id"], BLAKE)
    people.as_(BLAKE)
    with session_scope(runtime.session_factory) as db:
        db.execute(delete(User).where(User.email == ALEX))
        db.commit()

    [invitation] = pending(people, BLAKE)

    assert invitation["space_name"] == "Goa trip"
    assert invitation["invited_by"] is None


def test_the_listing_exposes_only_five_fields_and_no_secrets_or_space_content(
    people: People,
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    share(people.as_(ALEX), space["id"], "Hidden title", "HIDDEN BODY")
    people.as_(ALEX).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Hidden key", "value": "HIDDEN VALUE"}
    )
    token = invite_by_email(people, space["id"], BLAKE)

    response = people.as_(BLAKE).get("/api/invitations")

    body = response.json()
    assert set(body) == {"invitations"}
    [invitation] = body["invitations"]
    assert set(invitation) == {"id", "space_name", "invited_by", "invited_at", "expires_at"}
    secrets = (
        space["id"],
        token,
        hash_token(token),
        ALEX,
        "Hidden title",
        "HIDDEN BODY",
        "Hidden key",
        "HIDDEN VALUE",
    )
    for secret in secrets:
        assert secret not in response.text


def test_ids_are_stable_unique_and_not_the_token_hash(people: People) -> None:
    first = create_space(people.as_(ALEX), "First")
    second = create_space(people.as_(ALEX), "Second")
    first_token = invite_by_email(people, first["id"], BLAKE)
    second_token = invite_by_email(people, second["id"], BLAKE)

    ids = [row["id"] for row in pending(people, BLAKE)]

    assert ids == [row["id"] for row in pending(people, BLAKE)]
    assert len(set(ids)) == 2
    assert all(len(value) == 32 and set(value) <= set("0123456789abcdef") for value in ids)
    hashes = {hash_token(first_token), hash_token(second_token)}
    assert not hashes & set(ids)
    assert not {value[:32] for value in hashes} & set(ids)


def test_the_id_is_derived_from_the_token_hash_in_a_fixed_way() -> None:
    token_hash = hash_token("some-token")

    expected = hashlib.sha256(b"invitation:" + token_hash.encode()).hexdigest()[:32]

    assert invites_service.invitation_id(token_hash) == expected
    assert invites_service.invitation_id(token_hash) != invites_service.invitation_id("other")


def test_listing_needs_a_session(people: People) -> None:
    response = people.anonymous().get("/api/invitations")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_accepting_joins_the_space_and_marks_the_invite_used(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)

    accepted = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert accepted.status_code == 200
    assert accepted.json() == {"space_id": space["id"], "already_member": False}
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 200
    stored = stored_invite(runtime, token)
    assert stored["accepted_by"] == user_id_of(people, BLAKE)
    assert stored["accepted_at"] is not None
    assert stored["revoked_at"] is None
    assert pending(people, BLAKE) == []
    members = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()["members"]
    assert [member["display_name"] for member in members] == ["Alex", "Blake"]


def test_accepting_tells_the_inviter_and_the_open_space_pages(
    people: People,
    runtime: Runtime,
    sender: RecordingSender,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    blake_id = user_id_of(people, BLAKE)
    published: list[SpaceEvent] = []
    monkeypatch.setattr(runtime.env.events, "publish", published.append)

    people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    runtime.env.mailer.drain()
    assert published == [SpaceEvent(MEMBER_JOINED, space["id"], {"user_id": blake_id})]
    assert [m.subject for m in sender.to(ALEX) if "joined" in m.subject] == [
        "Blake joined Goa trip on Orbit"
    ]


def test_accepting_twice_says_you_are_already_in(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    blake = people.as_(BLAKE)
    blake.post(f"/api/invitations/{invitation_id}/accept")

    again = blake.post(f"/api/invitations/{invitation_id}/accept")

    assert again.status_code == 200
    assert again.json() == {"space_id": space["id"], "already_member": True}


def test_someone_who_joined_another_way_is_told_so_and_the_invite_is_left_alone(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    join(people, ALEX, BLAKE, space["id"])

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.json() == {"space_id": space["id"], "already_member": True}
    assert stored_invite(runtime, token) == UNTOUCHED


def test_someone_elses_invitation_id_is_not_found_and_nothing_changes(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    blakes_id = only_invitation_id(people, BLAKE)
    people.as_(CAROL)

    response = people.as_(CAROL).post(f"/api/invitations/{blakes_id}/accept")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invite_not_found"
    assert stored_invite(runtime, token) == UNTOUCHED
    assert people.as_(CAROL).get(f"/api/spaces/{space['id']}").status_code == 403
    assert len(pending(people, BLAKE)) == 1


def test_the_inviter_cannot_accept_on_behalf_of_the_addressee(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    blakes_id = only_invitation_id(people, BLAKE)

    response = people.as_(ALEX).post(f"/api/invitations/{blakes_id}/accept")

    assert response.status_code == 404
    assert stored_invite(runtime, token) == UNTOUCHED


@pytest.mark.parametrize("action", ["accept", "decline"])
def test_an_unknown_id_is_answered_exactly_like_someone_elses(people: People, action: str) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    blakes_id = only_invitation_id(people, BLAKE)
    carol = people.as_(CAROL)

    someone_elses = carol.post(f"/api/invitations/{blakes_id}/{action}")
    unknown = carol.post(f"/api/invitations/{UNKNOWN_ID}/{action}")

    assert someone_elses.status_code == unknown.status_code == 404
    assert someone_elses.json() == unknown.json()
    assert someone_elses.content == unknown.content


@pytest.mark.parametrize("action", ["accept", "decline"])
def test_neither_the_token_nor_its_hash_works_as_an_id(
    people: People, runtime: Runtime, action: str
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    blake = people.as_(BLAKE)

    for guess in (token, hash_token(token), hash_token(token)[:32]):
        response = blake.post(f"/api/invitations/{guess}/{action}")
        assert response.status_code == 404

    assert stored_invite(runtime, token) == UNTOUCHED


@pytest.mark.parametrize("action", ["accept", "decline"])
def test_an_invitation_to_a_deleted_space_is_not_found_and_left_alone(
    people: People, runtime: Runtime, action: str
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    with session_scope(runtime.session_factory) as db:
        row = db.get(Space, space["id"])
        assert row is not None
        row.deleted_at = runtime.env.now()
        db.commit()

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/{action}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invite_not_found"
    assert stored_invite(runtime, token) == UNTOUCHED


def test_an_expired_invitation_cannot_be_accepted(people: People, clock: FakeClock) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    clock.advance(days=8)

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "invite_unusable",
        "message": "This invite has expired. Ask for a new one.",
    }
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 403


def test_a_declined_invitation_cannot_be_accepted_afterwards(people: People) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    blake = people.as_(BLAKE)
    assert blake.post(f"/api/invitations/{invitation_id}/decline").status_code == 204

    response = blake.post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "invite_unusable",
        "message": "This invite is no longer valid. Ask for a new one.",
    }
    assert blake.get(f"/api/spaces/{space['id']}").status_code == 403


def test_an_invitation_used_up_through_the_emailed_link_cannot_be_accepted_again(
    people: People,
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    assert people.as_(CAROL).post(f"/api/invites/{token}/accept").status_code == 200

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "This invite was already used. Ask for a new one."
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 403


def test_the_emailed_link_reports_used_once_the_invitation_is_accepted(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    preview = people.anonymous().get(f"/api/invites/{token}").json()
    reuse = people.as_(CAROL).post(f"/api/invites/{token}/accept")

    assert preview["status"] == "used"
    assert reuse.status_code == 409
    assert reuse.json()["error"]["code"] == "invite_unusable"


def test_a_full_space_cannot_be_joined_through_an_invitation(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    fill_space(runtime, space["id"], 9)

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "limit_reached"
    assert response.json()["error"]["message"] == "This space is full. It already has 10 people."
    assert stored_invite(runtime, token) == UNTOUCHED
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 403


def test_nine_people_leave_room_for_one_more_through_an_invitation(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))
    invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    fill_space(runtime, space["id"], 8)

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 200


def test_fifty_spaces_is_the_most_anyone_can_belong_to_through_an_invitation(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    blake = people.as_(BLAKE)
    for index in range(50):
        create_space(blake, f"Space {index}")
    invitation_id = only_invitation_id(people, BLAKE)

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/accept")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "limit_reached"
    assert "50 spaces" in response.json()["error"]["message"]
    assert stored_invite(runtime, token) == UNTOUCHED
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 403


def test_declining_removes_the_invitation_and_revokes_the_emailed_link(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)

    declined = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/decline")

    assert declined.status_code == 204
    assert declined.content == b""
    assert pending(people, BLAKE) == []
    stored = stored_invite(runtime, token)
    assert stored["revoked_at"] is not None
    assert stored["accepted_at"] is None
    preview = people.anonymous().get(f"/api/invites/{token}").json()
    assert preview["status"] == "revoked"
    late = people.as_(BLAKE).post(f"/api/invites/{token}/accept")
    assert late.status_code == 409
    assert late.json()["error"]["message"] == "This invite is no longer valid. Ask for a new one."
    assert people.as_(BLAKE).get(f"/api/spaces/{space['id']}").status_code == 403


def test_declining_one_invitation_leaves_the_others_alone(people: People) -> None:
    first = create_space(people.as_(ALEX), "First")
    second = create_space(people.as_(ALEX), "Second")
    invite_by_email(people, first["id"], BLAKE)
    invite_by_email(people, second["id"], BLAKE)
    first_id = next(row["id"] for row in pending(people, BLAKE) if row["space_name"] == "First")

    assert people.as_(BLAKE).post(f"/api/invitations/{first_id}/decline").status_code == 204

    assert [row["space_name"] for row in pending(people, BLAKE)] == ["Second"]


def test_declining_twice_changes_nothing_the_second_time(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    blake = people.as_(BLAKE)
    first = blake.post(f"/api/invitations/{invitation_id}/decline")
    revoked_after_first = stored_invite(runtime, token)["revoked_at"]

    second = blake.post(f"/api/invitations/{invitation_id}/decline")

    assert (first.status_code, second.status_code) == (204, 204)
    assert stored_invite(runtime, token)["revoked_at"] == revoked_after_first


def test_declining_an_expired_invitation_is_a_quiet_no_op(
    people: People, runtime: Runtime, clock: FakeClock
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    clock.advance(days=8)

    response = people.as_(BLAKE).post(f"/api/invitations/{invitation_id}/decline")

    assert response.status_code == 204
    assert stored_invite(runtime, token) == UNTOUCHED


def test_declining_an_accepted_invitation_is_refused_and_revokes_nothing(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    invitation_id = only_invitation_id(people, BLAKE)
    blake = people.as_(BLAKE)
    blake.post(f"/api/invitations/{invitation_id}/accept")

    response = blake.post(f"/api/invitations/{invitation_id}/decline")

    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "invite_unusable",
        "message": "This invite was already used. Ask for a new one.",
    }
    assert stored_invite(runtime, token)["revoked_at"] is None
    assert blake.get(f"/api/spaces/{space['id']}").status_code == 200


def test_declining_someone_elses_invitation_is_not_found_and_leaves_it_alone(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX))
    token = invite_by_email(people, space["id"], BLAKE)
    blakes_id = only_invitation_id(people, BLAKE)

    response = people.as_(CAROL).post(f"/api/invitations/{blakes_id}/decline")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invite_not_found"
    assert stored_invite(runtime, token) == UNTOUCHED
    assert len(pending(people, BLAKE)) == 1
