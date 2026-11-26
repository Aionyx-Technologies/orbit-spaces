from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from orbit.db import session_scope
from orbit.models import OAuthToken, User
from orbit.runtime import Runtime
from orbit.security import hash_token
from orbit.services import spaces as spaces_service
from orbit.services.context import Actor
from tests.conftest import FakeClock, RecordingSender
from tests.oauth_helpers import (
    ACCEPT,
    MCP_URL,
    authorize_url,
    connect,
    exchange,
    make_pkce,
    mcp_rpc,
    mcp_tool_text,
    query_of,
    refresh,
    register,
    run_consent,
)


def obtain_code(
    client: TestClient,
    runtime: Runtime,
    sender: RecordingSender,
    registered: dict[str, Any],
    verifier_holder: list[str],
) -> str:
    pkce = make_pkce()
    verifier_holder.append(pkce.verifier)
    outcome = run_consent(client, runtime, sender, authorize_url(registered["client_id"], pkce))
    return query_of(outcome.headers["location"])["code"]


def test_a_valid_code_and_verifier_yield_tokens(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, registered, verifier)

    response = exchange(client, registered["client_id"], code, verifier[0])

    body = response.json()
    assert response.status_code == 200
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == 3600
    assert body["scope"] == "spaces"
    assert len(body["access_token"]) >= 43
    assert len(body["refresh_token"]) >= 64
    assert response.headers["cache-control"] == "no-store"


def test_tokens_are_stored_only_as_hashes_and_bound_to_the_resource(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)

    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(OAuthToken)).one()

    assert row.access_hash == hash_token(tokens["access_token"])
    assert row.refresh_hash == hash_token(tokens["refresh_token"])
    assert tokens["access_token"] not in str(row.__dict__)
    assert tokens["refresh_token"] not in str(row.__dict__)
    assert row.resource == MCP_URL
    assert row.scopes == ["spaces"]
    assert row.revoked_at is None


def test_a_wrong_pkce_verifier_is_refused(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, registered, verifier)

    response = exchange(client, registered["client_id"], code, make_pkce().verifier)

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_a_code_works_only_once(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, registered, verifier)

    first = exchange(client, registered["client_id"], code, verifier[0])
    second = exchange(client, registered["client_id"], code, verifier[0])

    assert first.status_code == 200
    assert second.status_code == 400
    assert second.json()["error"] == "invalid_grant"
    with session_scope(runtime.session_factory) as db:
        assert len(db.scalars(select(OAuthToken)).all()) == 1


def test_a_code_cannot_be_used_by_another_client(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    owner = register(client, name="ChatGPT")
    thief = register(client, name="Thief")
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, owner, verifier)

    response = exchange(client, thief["client_id"], code, verifier[0])

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_the_redirect_uri_must_match_the_one_used_to_authorize(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, registered, verifier)

    response = exchange(
        client,
        registered["client_id"],
        code,
        verifier[0],
        redirect_uri="https://chatgpt.test/other",
    )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_request"


def test_a_code_expires_after_ten_minutes(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    registered = register(client)
    verifier: list[str] = []
    code = obtain_code(client, runtime, sender, registered, verifier)
    clock.advance(minutes=11)

    response = exchange(client, registered["client_id"], code, verifier[0])

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_a_confidential_client_must_present_its_secret(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client, method="client_secret_post")
    pkce = make_pkce()
    outcome = run_consent(client, runtime, sender, authorize_url(registered["client_id"], pkce))
    code = query_of(outcome.headers["location"])["code"]

    missing = exchange(client, registered["client_id"], code, pkce.verifier)
    wrong = exchange(client, registered["client_id"], code, pkce.verifier, secret="not-it")
    right = exchange(
        client, registered["client_id"], code, pkce.verifier, secret=registered["client_secret"]
    )

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert right.status_code == 200


def test_the_access_token_opens_the_mcp_endpoint(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)

    listing = mcp_rpc(client, tokens["access_token"], "tools/list")
    spaces = mcp_tool_text(client, tokens["access_token"], "list_spaces", {})

    assert listing.status_code == 200
    names = {tool["name"] for tool in listing.json()["result"]["tools"]}
    assert {"list_spaces", "share_to_space", "get_space_context"} <= names
    assert "not in any Orbit space" in spaces


def test_the_mcp_endpoint_refuses_missing_wrong_and_foreign_tokens(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)
    with session_scope(runtime.session_factory) as db:
        db.execute(update(OAuthToken).values(resource="https://other.example/mcp"))
        db.commit()

    none = mcp_rpc(client, None, "tools/list")
    garbage = mcp_rpc(client, "garbage", "tools/list")
    wrong_audience = mcp_rpc(client, tokens["access_token"], "tools/list")

    assert none.status_code == 401
    assert garbage.status_code == 401
    assert wrong_audience.status_code == 401
    assert "resource_metadata=" in none.headers["www-authenticate"]


def test_the_mcp_endpoint_refuses_foreign_origins_even_with_a_valid_token(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)

    response = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        headers={
            "Accept": ACCEPT,
            "Authorization": f"Bearer {tokens['access_token']}",
            "Origin": "https://evil.example",
        },
    )

    assert response.status_code == 403


def test_an_access_token_expires_after_an_hour(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    tokens = connect(client, runtime, sender)
    clock.advance(minutes=61)

    response = mcp_rpc(client, tokens["access_token"], "tools/list")

    assert response.status_code == 401


def test_the_assistant_name_is_attached_to_what_it_writes(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender, name="Grok")
    token = tokens["access_token"]
    with session_scope(runtime.session_factory) as db:
        user = db.scalars(select(User)).one()
        spaces_service.create_space(db, runtime.env, Actor.web(user.id), "Trip")

    mcp_tool_text(client, token, "share_to_space", {"title": "Hi", "content": "From Grok"})
    context = mcp_tool_text(client, token, "get_space_context", {})

    assert "Content shared by Alex via Grok" in context


def test_refreshing_rotates_both_tokens(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)

    response = refresh(client, tokens["client_id"], tokens["refresh_token"])

    body = response.json()
    assert response.status_code == 200
    assert body["access_token"] != tokens["access_token"]
    assert body["refresh_token"] != tokens["refresh_token"]
    assert mcp_rpc(client, body["access_token"], "tools/list").status_code == 200
    assert mcp_rpc(client, tokens["access_token"], "tools/list").status_code == 401


def test_reusing_a_rotated_refresh_token_revokes_the_whole_grant(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)
    rotated = refresh(client, tokens["client_id"], tokens["refresh_token"]).json()

    replay = refresh(client, tokens["client_id"], tokens["refresh_token"])

    assert replay.status_code == 400
    assert replay.json()["error"] == "invalid_grant"
    assert mcp_rpc(client, rotated["access_token"], "tools/list").status_code == 401
    follow_up = refresh(client, tokens["client_id"], rotated["refresh_token"])
    assert follow_up.status_code == 400


def test_a_refresh_token_expires_after_thirty_days(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    tokens = connect(client, runtime, sender)
    clock.advance(days=31)

    response = refresh(client, tokens["client_id"], tokens["refresh_token"])

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_a_refresh_token_cannot_be_used_by_another_client(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)
    thief = register(client, name="Thief")

    response = refresh(client, thief["client_id"], tokens["refresh_token"])

    assert response.status_code == 400
    assert mcp_rpc(client, tokens["access_token"], "tools/list").status_code == 200


def test_refreshing_cannot_widen_the_scope(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)

    response = refresh(client, tokens["client_id"], tokens["refresh_token"], scope="spaces admin")

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_scope"


def revoke(client: TestClient, client_id: str, token: str) -> Any:
    return client.post(
        "/oauth/revoke", data={"token": token, "client_id": client_id, "client_secret": ""}
    )


@pytest.mark.parametrize("which", ["access_token", "refresh_token"])
def test_revoking_either_token_ends_the_whole_grant(
    client: TestClient, runtime: Runtime, sender: RecordingSender, which: str
) -> None:
    tokens = connect(client, runtime, sender)

    response = revoke(client, tokens["client_id"], tokens[which])

    assert response.status_code == 200
    assert mcp_rpc(client, tokens["access_token"], "tools/list").status_code == 401
    assert refresh(client, tokens["client_id"], tokens["refresh_token"]).status_code == 400


def test_one_client_cannot_revoke_anothers_token(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    tokens = connect(client, runtime, sender)
    thief = register(client, name="Thief")

    response = revoke(client, thief["client_id"], tokens["access_token"])

    assert response.status_code == 200
    assert mcp_rpc(client, tokens["access_token"], "tools/list").status_code == 200


def test_revoking_something_unknown_is_harmless(client: TestClient) -> None:
    registered = register(client)

    response = revoke(client, registered["client_id"], "never-issued")

    assert response.status_code == 200


def test_the_token_endpoint_rejects_unknown_grant_types(client: TestClient) -> None:
    registered = register(client)

    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "password",
            "client_id": registered["client_id"],
            "username": "a",
            "password": "b",
        },
    )

    assert response.status_code == 400
