from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.db import session_scope
from orbit.limits import AUTHORIZE_PER_IP
from orbit.models import OAuthClient, OAuthCode
from orbit.runtime import Runtime
from orbit.security import hash_token
from tests.conftest import BASE_URL, FakeClock, RecordingSender
from tests.oauth_helpers import (
    MCP_URL,
    REDIRECT_URI,
    authorize_url,
    decide,
    hidden_field,
    make_pkce,
    query_of,
    register,
    run_consent,
    sign_in_for_consent,
)


def start(client: TestClient, **kwargs: str | None) -> tuple[dict[str, str], str]:
    registered = register(client)
    pkce = make_pkce()
    response = client.get(authorize_url(registered["client_id"], pkce, **kwargs))
    assert response.status_code == 302
    return registered, response.headers["location"]


def test_authorize_sends_the_person_to_the_consent_page(client: TestClient) -> None:
    _registered, location = start(client)

    assert location.startswith(f"{BASE_URL}/oauth/consent?request=")


def test_authorize_requests_are_limited_per_address(client: TestClient) -> None:
    registered = register(client)
    url = authorize_url(registered["client_id"], make_pkce())
    allowed, _window = AUTHORIZE_PER_IP

    statuses = [client.get(url).status_code for _ in range(allowed + 1)]

    assert statuses[:allowed] == [302] * allowed
    assert statuses[-1] == 429
    assert client.get(url).json()["error"] == "temporarily_unavailable"


def test_a_trailing_slash_on_the_resource_is_tolerated(client: TestClient) -> None:
    _registered, location = start(client, resource=f"{MCP_URL}/")

    assert "/oauth/consent" in location


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"resource": None}, "invalid_target"),
        ({"resource": "https://other.example/mcp"}, "invalid_target"),
        ({"resource": "not a url"}, "invalid_target"),
        ({"redirect_uri": None}, "invalid_request"),
        ({"scope": "spaces admin"}, "invalid_scope"),
        ({"method": "plain"}, "invalid_request"),
    ],
)
def test_bad_requests_are_sent_back_to_the_client_with_an_error_and_state(
    client: TestClient, overrides: dict[str, str | None], error: str
) -> None:
    registered = register(client)
    response = client.get(authorize_url(registered["client_id"], make_pkce(), **overrides))

    assert response.status_code == 302
    assert response.headers["location"].startswith(REDIRECT_URI)
    query = query_of(response.headers["location"])
    assert query["error"] == error
    if overrides.get("redirect_uri", "present") is not None:
        assert query["state"] == "state-123"


def test_omitting_the_scope_defaults_to_spaces(client: TestClient) -> None:
    _registered, location = start(client, scope=None)

    assert "/oauth/consent" in location


def test_an_unregistered_redirect_uri_is_never_redirected_to(client: TestClient) -> None:
    registered = register(client)

    response = client.get(
        authorize_url(
            registered["client_id"], make_pkce(), redirect_uri="https://attacker.example/cb"
        )
    )

    assert response.status_code == 400
    assert "location" not in response.headers
    assert response.json()["error"] == "invalid_request"


def test_an_unknown_client_is_refused_without_a_redirect(client: TestClient) -> None:
    response = client.get(authorize_url("nobody", make_pkce()))

    assert response.status_code == 400
    assert "location" not in response.headers


def test_consent_asks_a_signed_out_person_to_sign_in_first(client: TestClient) -> None:
    _registered, location = start(client)

    response = client.get(location)

    assert response.status_code == 303
    target = urlparse(response.headers["location"])
    assert target.path == "/auth/sign-in"
    assert parse_qs(target.query)["next"][0].startswith("/oauth/consent?request=")


def test_the_consent_page_names_the_assistant_and_where_it_returns_to(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)

    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    assert page.status_code == 200
    assert "ChatGPT wants to connect to your Orbit spaces" in page.text
    assert "<strong>chatgpt.test</strong>" in page.text
    assert "Orbit cannot check that ChatGPT is who it says it is" in page.text
    assert "alex@example.com" in page.text
    assert "Use a different account" in page.text
    assert 'value="allow"' in page.text
    assert 'value="deny"' in page.text
    assert "MCP" not in page.text


def test_the_consent_page_warns_when_the_name_does_not_match_the_address(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    hostile = "https://attacker.test/callback"
    registered = register(client, name="Claude", redirect_uri=hostile)
    response = client.get(authorize_url(registered["client_id"], make_pkce(), redirect_uri=hostile))
    assert response.status_code == 302

    page = sign_in_for_consent(
        client, runtime, sender, response.headers["location"], "alex@example.com"
    )

    assert page.status_code == 200
    assert "does not match" in page.text
    assert "<strong>attacker.test</strong>" in page.text


def test_the_consent_page_does_not_warn_when_the_name_matches_the_address(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)

    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    assert "does not match" not in page.text


def test_the_consent_page_cannot_be_framed_or_cached(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)

    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    assert page.headers["x-frame-options"] == "DENY"
    policy = page.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in policy
    assert "form-action" not in policy
    assert page.headers["cache-control"] == "no-store"


def test_a_tampered_or_garbage_request_is_refused(client: TestClient) -> None:
    _registered, location = start(client)
    tampered = location[:-3] + "xyz"

    for bad in (tampered, f"{BASE_URL}/oauth/consent?request=garbage", f"{BASE_URL}/oauth/consent"):
        response = client.get(bad)
        assert response.status_code == 400
        assert "This request expired" in response.text


def test_a_request_expires_after_fifteen_minutes(client: TestClient, clock: FakeClock) -> None:
    _registered, location = start(client)
    clock.advance(minutes=16)

    response = client.get(location)

    assert response.status_code == 400


def test_allow_returns_a_code_state_and_issuer_to_the_client(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)

    outcome = run_consent(
        client,
        runtime,
        sender,
        authorize_url(registered["client_id"], make_pkce()),
    )

    assert outcome.status_code == 303
    assert outcome.headers["location"].startswith(f"{REDIRECT_URI}?")
    query = query_of(outcome.headers["location"])
    assert query["state"] == "state-123"
    assert query["iss"] == BASE_URL
    assert len(query["code"]) >= 43


def test_the_code_is_stored_only_as_a_hash(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)
    outcome = run_consent(
        client, runtime, sender, authorize_url(registered["client_id"], make_pkce())
    )
    code = query_of(outcome.headers["location"])["code"]

    with session_scope(runtime.session_factory) as db:
        rows = db.scalars(select(OAuthCode)).all()

    assert [row.code_hash for row in rows] == [hash_token(code)]
    assert rows[0].resource == MCP_URL
    assert rows[0].scopes == ["spaces"]


def test_cancel_returns_access_denied_and_creates_nothing(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered = register(client)

    outcome = run_consent(
        client,
        runtime,
        sender,
        authorize_url(registered["client_id"], make_pkce()),
        decision="deny",
    )

    query = query_of(outcome.headers["location"])
    assert query["error"] == "access_denied"
    assert query["state"] == "state-123"
    assert query["iss"] == BASE_URL
    assert "code" not in query
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(OAuthCode)).all() == []


def test_the_decision_must_come_from_the_sites_own_origin(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)
    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    response = client.post(
        "/oauth/consent",
        data={
            "request": hidden_field(page.text, "request"),
            "csrf": hidden_field(page.text, "csrf"),
            "decision": "allow",
        },
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(OAuthCode)).all() == []


def test_a_missing_or_wrong_csrf_token_is_refused(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)
    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    missing = decide(client, page, csrf="")
    forged = decide(client, page, csrf="forged-value")

    assert missing.status_code == 400
    assert forged.status_code == 400
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(OAuthCode)).all() == []


def test_a_csrf_token_belongs_to_one_person_and_one_request(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _first, first_location = start(client)
    alex_page = sign_in_for_consent(client, runtime, sender, first_location, "alex@example.com")
    alex_csrf = hidden_field(alex_page.text, "csrf")
    alex_request = hidden_field(alex_page.text, "request")
    _second, second_location = start(client)
    other_page = sign_in_for_consent(client, runtime, sender, second_location, "alex@example.com")
    other_request = hidden_field(other_page.text, "request")

    swapped = client.post(
        "/oauth/consent",
        data={"request": other_request, "csrf": alex_csrf, "decision": "allow"},
    )
    client.cookies.clear()
    bob_page = sign_in_for_consent(client, runtime, sender, first_location, "bob@example.com")
    stolen = client.post(
        "/oauth/consent",
        data={"request": alex_request, "csrf": alex_csrf, "decision": "allow"},
    )

    assert bob_page.status_code == 200
    assert swapped.status_code == 400
    assert stolen.status_code == 400


def test_an_unrecognised_decision_is_not_treated_as_consent(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)
    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")

    response = decide(client, page, decision="maybe")

    assert response.status_code == 400
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(OAuthCode)).all() == []


def test_a_decision_without_a_session_goes_back_to_sign_in(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    _registered, location = start(client)
    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")
    client.cookies.clear()

    response = decide(client, page)

    assert response.status_code == 303
    assert response.headers["location"].startswith("/auth/sign-in?next=")


def test_consent_for_a_client_that_no_longer_exists_is_refused(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    registered, location = start(client)
    page = sign_in_for_consent(client, runtime, sender, location, "alex@example.com")
    with session_scope(runtime.session_factory) as db:
        row = db.get(OAuthClient, registered["client_id"])
        assert row is not None
        db.delete(row)
        db.commit()

    response = decide(client, page)

    assert response.status_code == 400
    assert "not registered" in response.text
