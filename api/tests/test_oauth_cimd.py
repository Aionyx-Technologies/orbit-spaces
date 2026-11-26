from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.db import session_scope
from orbit.models import OAuthClient
from orbit.runtime import Runtime
from tests.conftest import FakeClock, FakeFetcher, RecordingSender
from tests.oauth_helpers import (
    authorize_url,
    exchange,
    make_pkce,
    query_of,
    run_consent,
    sign_in_for_consent,
)

CIMD_URL = "https://client.example/oauth/metadata.json"
CALLBACK = "https://grok.test/callback"


def document(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "client_id": CIMD_URL,
        "client_name": "Grok",
        "redirect_uris": [CALLBACK],
        "token_endpoint_auth_method": "none",
    }
    body.update(overrides)
    return body


def authorize(client: TestClient, **kwargs: Any) -> Any:
    return client.get(authorize_url(CIMD_URL, make_pkce(), redirect_uri=CALLBACK, **kwargs))


def test_a_url_client_id_connects_without_registering(
    client: TestClient, runtime: Runtime, sender: RecordingSender, fetcher: FakeFetcher
) -> None:
    fetcher.documents[CIMD_URL] = document()
    pkce = make_pkce()

    outcome = run_consent(
        client,
        runtime,
        sender,
        authorize_url(CIMD_URL, pkce, redirect_uri=CALLBACK),
    )

    assert outcome.headers["location"].startswith(CALLBACK)
    code = query_of(outcome.headers["location"])["code"]
    tokens = exchange(client, CIMD_URL, code, pkce.verifier, redirect_uri=CALLBACK)
    assert tokens.status_code == 200
    with session_scope(runtime.session_factory) as db:
        row = db.get(OAuthClient, CIMD_URL)
    assert row is not None
    assert row.registration_type == "cimd"
    assert row.client_name == "Grok"
    assert row.redirect_uris == [CALLBACK]


def chatgpt_style_document() -> dict[str, Any]:
    """Shaped like https://chatgpt.com/oauth/client.json: it prefers private_key_jwt
    but also supports acting as a public client."""
    return document(
        client_name="ChatGPT",
        token_endpoint_auth_method="private_key_jwt",
        token_endpoint_auth_methods_supported=["none", "private_key_jwt"],
        grant_types=[
            "authorization_code",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
        ],
        response_types=["code"],
        token_endpoint_auth_signing_alg="RS256",
        jwks_uri="https://client.example/oauth/jwks.json",
    )


def test_a_client_that_also_supports_public_auth_connects_as_a_public_client(
    client: TestClient, runtime: Runtime, sender: RecordingSender, fetcher: FakeFetcher
) -> None:
    fetcher.documents[CIMD_URL] = chatgpt_style_document()
    pkce = make_pkce()

    outcome = run_consent(
        client,
        runtime,
        sender,
        authorize_url(CIMD_URL, pkce, redirect_uri=CALLBACK),
    )

    assert outcome.headers["location"].startswith(CALLBACK)
    code = query_of(outcome.headers["location"])["code"]
    tokens = exchange(client, CIMD_URL, code, pkce.verifier, redirect_uri=CALLBACK)
    assert tokens.status_code == 200
    with session_scope(runtime.session_factory) as db:
        row = db.get(OAuthClient, CIMD_URL)
    assert row is not None
    assert row.client_name == "ChatGPT"
    assert row.metadata_json["token_endpoint_auth_method"] == "none"


def test_the_consent_page_uses_the_name_from_the_document(
    client: TestClient, runtime: Runtime, sender: RecordingSender, fetcher: FakeFetcher
) -> None:
    fetcher.documents[CIMD_URL] = document(client_name="Grok")
    authorization = authorize(client)

    page = sign_in_for_consent(
        client, runtime, sender, authorization.headers["location"], "alex@example.com"
    )

    assert "Grok wants to connect to your Orbit spaces" in page.text
    assert "grok.test" in page.text


def test_the_document_is_cached_for_an_hour(
    client: TestClient,
    runtime: Runtime,
    sender: RecordingSender,
    fetcher: FakeFetcher,
    clock: FakeClock,
) -> None:
    fetcher.documents[CIMD_URL] = document()
    authorize(client)
    authorize(client)
    assert fetcher.calls == [CIMD_URL]

    clock.advance(minutes=61)
    authorize(client)

    assert fetcher.calls == [CIMD_URL, CIMD_URL]


def test_a_stale_copy_is_used_when_the_refresh_fails(
    client: TestClient, fetcher: FakeFetcher, clock: FakeClock
) -> None:
    fetcher.documents[CIMD_URL] = document()
    assert authorize(client).status_code == 302
    clock.advance(minutes=61)
    fetcher.failing = True

    response = authorize(client)

    assert response.status_code == 302
    assert len(fetcher.calls) == 2


def test_changed_redirect_uris_are_picked_up_on_refresh(
    client: TestClient, fetcher: FakeFetcher, clock: FakeClock
) -> None:
    fetcher.documents[CIMD_URL] = document()
    authorize(client)
    fetcher.documents[CIMD_URL] = document(redirect_uris=["https://grok.test/new"])
    clock.advance(minutes=61)

    old = authorize(client)
    new = client.get(authorize_url(CIMD_URL, make_pkce(), redirect_uri="https://grok.test/new"))

    assert old.status_code == 400
    assert new.status_code == 302


def test_an_unreachable_document_means_an_unknown_client(
    client: TestClient, fetcher: FakeFetcher
) -> None:
    fetcher.failing = True

    response = authorize(client)

    assert response.status_code == 400
    assert "location" not in response.headers


@pytest.mark.parametrize(
    "overrides",
    [
        {"client_id": "https://client.example/something-else.json"},
        {"token_endpoint_auth_method": "client_secret_basic"},
        {"redirect_uris": ["http://evil.example/cb"]},
        {"redirect_uris": []},
    ],
)
def test_an_unsafe_document_is_not_trusted(
    client: TestClient, fetcher: FakeFetcher, runtime: Runtime, overrides: dict[str, Any]
) -> None:
    fetcher.documents[CIMD_URL] = document(**overrides)

    response = authorize(client)

    assert response.status_code == 400
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(OAuthClient)).all() == []


def test_a_redirect_uri_outside_the_document_is_refused(
    client: TestClient, fetcher: FakeFetcher
) -> None:
    fetcher.documents[CIMD_URL] = document()

    response = client.get(
        authorize_url(CIMD_URL, make_pkce(), redirect_uri="https://attacker.example/cb")
    )

    assert response.status_code == 400
    assert "location" not in response.headers


def test_a_bare_origin_is_not_a_client_metadata_url(
    client: TestClient, fetcher: FakeFetcher
) -> None:
    response = client.get(authorize_url("https://client.example", make_pkce()))

    assert response.status_code == 400
    assert fetcher.calls == []
