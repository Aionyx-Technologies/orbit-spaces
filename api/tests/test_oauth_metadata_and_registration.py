from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.db import session_scope
from orbit.limits import MAX_REDIRECT_URIS, REGISTRATION_PER_IP
from orbit.models import OAuthClient
from orbit.runtime import Runtime
from tests.conftest import BASE_URL
from tests.oauth_helpers import MCP_URL, REDIRECT_URI, register


def test_authorization_server_metadata_describes_every_endpoint(client: TestClient) -> None:
    response = client.get("/.well-known/oauth-authorization-server")

    body = response.json()
    assert response.status_code == 200
    assert body["issuer"] == BASE_URL
    assert body["authorization_endpoint"] == f"{BASE_URL}/oauth/authorize"
    assert body["token_endpoint"] == f"{BASE_URL}/oauth/token"
    assert body["registration_endpoint"] == f"{BASE_URL}/oauth/register"
    assert body["revocation_endpoint"] == f"{BASE_URL}/oauth/revoke"
    assert body["code_challenge_methods_supported"] == ["S256"]
    assert body["response_types_supported"] == ["code"]
    assert body["grant_types_supported"] == ["authorization_code", "refresh_token"]
    assert body["scopes_supported"] == ["spaces"]
    assert body["client_id_metadata_document_supported"] is True
    assert body["authorization_response_iss_parameter_supported"] is True
    assert "none" in body["token_endpoint_auth_methods_supported"]
    assert response.headers["access-control-allow-origin"] == "*"


@pytest.mark.parametrize(
    "path", ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]
)
def test_protected_resource_metadata_points_at_this_server(client: TestClient, path: str) -> None:
    response = client.get(path)
    issuer = client.get("/.well-known/oauth-authorization-server").json()["issuer"]

    body = response.json()
    assert response.status_code == 200
    assert body["resource"] == MCP_URL
    assert body["authorization_servers"] == [issuer]
    assert body["bearer_methods_supported"] == ["header"]


def test_a_public_client_can_register_and_gets_no_secret(
    client: TestClient, runtime: Runtime
) -> None:
    registered = register(client, name="ChatGPT")

    assert registered["client_name"] == "ChatGPT"
    assert registered["token_endpoint_auth_method"] == "none"
    assert registered.get("client_secret") is None
    assert registered["scope"] == "spaces"
    with session_scope(runtime.session_factory) as db:
        row = db.get(OAuthClient, registered["client_id"])
    assert row is not None
    assert row.registration_type == "dcr"
    assert row.redirect_uris == [REDIRECT_URI]


def test_a_confidential_client_gets_a_secret_that_is_never_stored(
    client: TestClient, runtime: Runtime
) -> None:
    registered = register(client, method="client_secret_post")

    secret = registered["client_secret"]
    assert len(secret) >= 32
    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(OAuthClient)).one()
    assert secret not in str(row.metadata_json)
    assert secret not in str(row.__dict__)
    assert runtime.env.signer.derive_client_secret(registered["client_id"]) == secret


def test_client_names_are_cleaned_before_they_are_stored(client: TestClient) -> None:
    registered = register(client, name="  Evil\nAssistant\x00  \t 2 ")

    assert registered["client_name"] == "Evil Assistant 2"


def test_a_missing_name_falls_back_to_the_redirect_host(client: TestClient) -> None:
    response = client.post(
        "/oauth/register",
        json={"redirect_uris": ["https://grok.test/cb"], "token_endpoint_auth_method": "none"},
    )

    assert response.status_code == 201
    assert response.json()["client_name"] == "grok.test"


@pytest.mark.parametrize(
    "bad_uri",
    [
        "http://evil.example/callback",
        "javascript:alert(1)",
        "data:text/html,hello",
        "https://example.com/cb#fragment",
        "https://user:pass@example.com/cb",
        "file:///etc/passwd",
        "vscode://vscode.git/callback",
        "chrome-extension://abcdefghijklmnop/cb",
        "ms-msdt:/id",
        "view-source:https://example.com",
        "cursor://anysphere.cursor-mcp/oauth/callback",
    ],
)
def test_unsafe_redirect_uris_are_refused(client: TestClient, bad_uri: str) -> None:
    response = client.post(
        "/oauth/register",
        json={"client_name": "X", "redirect_uris": [bad_uri], "token_endpoint_auth_method": "none"},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_redirect_uri"


@pytest.mark.parametrize(
    "good_uri",
    [
        "https://claude.ai/api/mcp/auth_callback",
        "http://localhost:6274/oauth/callback",
        "http://127.0.0.1:33418/callback",
        "com.example.assistant://oauth/callback",
    ],
)
def test_normal_redirect_uris_are_accepted(client: TestClient, good_uri: str) -> None:
    assert register(client, redirect_uri=good_uri)["redirect_uris"]


def test_too_many_redirect_uris_are_refused(client: TestClient) -> None:
    uris = [f"https://example.com/cb{index}" for index in range(MAX_REDIRECT_URIS + 1)]

    response = client.post(
        "/oauth/register",
        json={"client_name": "X", "redirect_uris": uris, "token_endpoint_auth_method": "none"},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_redirect_uri"


def test_registration_without_redirect_uris_is_refused(client: TestClient) -> None:
    response = client.post("/oauth/register", json={"client_name": "X"})

    assert response.status_code == 400


def test_asking_for_other_scopes_is_refused(client: TestClient) -> None:
    response = client.post(
        "/oauth/register",
        json={
            "client_name": "X",
            "redirect_uris": [REDIRECT_URI],
            "token_endpoint_auth_method": "none",
            "scope": "spaces admin",
        },
    )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_client_metadata"


def test_unsupported_authentication_methods_are_refused(client: TestClient) -> None:
    response = client.post(
        "/oauth/register",
        json={
            "client_name": "X",
            "redirect_uris": [REDIRECT_URI],
            "token_endpoint_auth_method": "private_key_jwt",
        },
    )

    assert response.status_code == 400


def test_registration_is_rate_limited_per_address(client: TestClient) -> None:
    allowed, _window = REGISTRATION_PER_IP
    for _ in range(allowed):
        assert (
            client.post(
                "/oauth/register",
                json={
                    "client_name": "X",
                    "redirect_uris": [REDIRECT_URI],
                    "token_endpoint_auth_method": "none",
                },
            ).status_code
            == 201
        )

    blocked: Any = client.post(
        "/oauth/register",
        json={
            "client_name": "X",
            "redirect_uris": [REDIRECT_URI],
            "token_endpoint_auth_method": "none",
        },
    )

    assert blocked.status_code == 429
    assert blocked.json()["error"] == "temporarily_unavailable"


def test_registration_is_open_to_browsers_via_cors(client: TestClient) -> None:
    preflight = client.options(
        "/oauth/register",
        headers={
            "Origin": "https://inspector.test",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "*"
