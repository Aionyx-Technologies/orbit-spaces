from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from orbit.db import session_scope
from orbit.limits import ACCOUNT_EXPORTS_PER_USER
from orbit.models import OAuthClient, OAuthToken, User
from orbit.runtime import Runtime
from orbit.security import hash_token
from tests.conftest import FakeClock, RecordingSender
from tests.rest_helpers import People, create_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"
URL = "/api/me/export"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def export(people: People, email: str) -> dict[str, Any]:
    response = people.as_(email).get(URL)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def field_names(value: Any) -> list[str]:
    if isinstance(value, dict):
        return [*value, *(name for inner in value.values() for name in field_names(inner))]
    if isinstance(value, list):
        return [name for inner in value for name in field_names(inner)]
    return []


def connect_assistant(runtime: Runtime, user_id: str) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        db.add(
            OAuthClient(
                client_id="https://assistant.example/client.json",
                client_name="TestAssistant",
                redirect_uris=["https://assistant.example/callback"],
                registration_type="cimd",
                metadata_json={},
                created_at=now,
            )
        )
        db.flush()
        db.add(
            OAuthToken(
                access_hash=hash_token("access-secret"),
                refresh_hash=hash_token("refresh-secret"),
                client_id="https://assistant.example/client.json",
                user_id=user_id,
                scopes=["spaces"],
                resource=None,
                access_expires_at=now + timedelta(hours=1),
                refresh_expires_at=now + timedelta(days=30),
                revoked_at=None,
                created_at=now,
            )
        )
        db.commit()


def test_the_download_needs_a_signed_in_person(people: People) -> None:
    response = people.anonymous().get(URL)

    assert response.status_code == 401


def test_the_download_is_a_json_file_that_is_never_cached(people: People) -> None:
    response = people.as_(ALEX).get(URL)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="orbit-account-'
    )
    assert response.headers["content-disposition"].endswith('.json"')
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_it_holds_the_account_and_preferences(people: People) -> None:
    people.as_(ALEX).patch("/api/me", json={"about": "Plans trips", "time_zone": "Europe/Lisbon"})

    document = export(people, ALEX)

    assert document["format"] == "orbit-account-export-1"
    account = document["account"]
    assert account["email"] == ALEX
    assert account["display_name"] == "Alex"
    assert account["about"] == "Plans trips"
    assert account["time_zone"] == "Europe/Lisbon"
    assert account["email_frequency"] == "instant"
    assert account["photo_path"] is None
    assert document["waitlist"] is None


def test_it_holds_every_space_with_its_items_and_facts(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    share(people.as_(ALEX), space["id"], "Morning flight", "Leaves at 7:10")
    share(people.as_(BLAKE), space["id"], "Hotel idea", "Near the beach")
    people.as_(ALEX).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Dates", "value": "Dec 20"}
    )

    document = export(people, ALEX)

    [exported] = document["spaces"]
    assert exported["space"]["name"] == "Goa trip"
    assert {item["title"] for item in exported["items"]} == {"Morning flight", "Hotel idea"}
    assert [fact["key"] for fact in exported["memory"]["current"]] == ["Dates"]
    assert exported["you"] == {"email_notifications": True}
    assert [item["title"] for item in document["things_you_shared"]] == ["Morning flight"]
    assert document["things_you_shared"][0]["space"] == "Goa trip"
    assert [fact["value"] for fact in document["facts_you_set"]] == ["Dec 20"]


def test_it_holds_nothing_from_spaces_the_person_is_not_in(people: People) -> None:
    private = create_space(people.as_(ALEX), "Alex only")
    share(people.as_(ALEX), private["id"], "Secret plan", "Only for Alex")
    shared = create_space(people.as_(BLAKE), "Blake and Carol")
    join(people, BLAKE, CAROL, shared["id"])
    share(people.as_(BLAKE), shared["id"], "Blake note", "Body")

    carols = json.dumps(export(people, CAROL))

    assert "Alex only" not in carols
    assert "Secret plan" not in carols
    assert "Only for Alex" not in carols
    assert export(people, CAROL)["things_you_shared"] == []


def test_it_holds_no_other_persons_email_or_profile(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    people.as_(BLAKE).patch("/api/me", json={"about": "Blake private about line"})

    text = json.dumps(export(people, ALEX))

    assert BLAKE not in text
    assert "Blake private about line" not in text
    assert "Blake" in text


def test_it_holds_no_secrets_or_hashes(people: People, runtime: Runtime) -> None:
    session = people.sign_in(ALEX)
    with session_scope(runtime.session_factory) as db:
        user = db.query(User).filter_by(email=ALEX).one()
        user_id = user.id
    connect_assistant(runtime, user_id)
    space = create_space(people.as_(ALEX), "Goa trip")
    people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={})

    text = people.as_(ALEX).get(URL).text

    assert session not in text
    assert hash_token(session) not in text
    assert hash_token("access-secret") not in text
    assert hash_token("refresh-secret") not in text
    names = {name.lower() for name in field_names(json.loads(text))}
    assert not {name for name in names if "token" in name or "hash" in name or "secret" in name}


def test_it_lists_assistants_sessions_and_invitations(people: People, runtime: Runtime) -> None:
    people.client.headers["user-agent"] = "Mozilla/5.0 Firefox/132.0"
    people.sign_in(ALEX)
    with session_scope(runtime.session_factory) as db:
        alex_id = db.query(User).filter_by(email=ALEX).one().id
    connect_assistant(runtime, alex_id)
    space = create_space(people.as_(ALEX), "Goa trip")
    people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={"email": CAROL})
    people.sign_in(CAROL)

    alex = export(people, ALEX)
    carol = export(people, CAROL)

    assert [row["assistant"] for row in alex["connected_assistants"]] == ["TestAssistant"]
    assert alex["connected_assistants"][0]["returns_to"] == "assistant.example"
    assert alex["browser_sessions"][0]["browser"] == "Firefox"
    [sent] = alex["invitations_you_sent"]
    assert (sent["space"], sent["sent_to"], sent["status"]) == ("Goa trip", CAROL, "waiting")
    [received] = carol["invitations_sent_to_you"]
    assert (received["space"], received["invited_by"], received["status"]) == (
        "Goa trip",
        "Alex",
        "waiting",
    )
    assert carol["invitations_you_sent"] == []
    assert alex["invitations_sent_to_you"] == []


def test_the_download_is_limited_each_day(people: People, clock: FakeClock) -> None:
    limit, window = ACCOUNT_EXPORTS_PER_USER
    people.sign_in(ALEX)
    for _ in range(limit):
        assert people.as_(ALEX).get(URL).status_code == 200

    blocked = people.as_(ALEX).get(URL)
    assert blocked.status_code == 429

    clock.advance(seconds=window.total_seconds() + 60)
    assert people.as_(ALEX).get(URL).status_code == 200
