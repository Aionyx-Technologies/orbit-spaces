from __future__ import annotations

import base64
import hashlib
import re
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from fastapi.testclient import TestClient
from httpx import Response

from orbit.runtime import Runtime
from tests.auth_helpers import open_sign_in_link
from tests.conftest import BASE_URL, RecordingSender

MCP_URL = f"{BASE_URL}/mcp"
REDIRECT_URI = "https://chatgpt.test/callback"
ACCEPT = "application/json, text/event-stream"


@dataclass(frozen=True)
class Pkce:
    verifier: str
    challenge: str


def make_pkce() -> Pkce:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return Pkce(verifier, base64.urlsafe_b64encode(digest).decode().rstrip("="))


def register(
    client: TestClient,
    *,
    name: str = "ChatGPT",
    redirect_uri: str = REDIRECT_URI,
    method: str = "none",
    **extra: Any,
) -> dict[str, Any]:
    response = client.post(
        "/oauth/register",
        json={
            "client_name": name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": method,
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def authorize_url(
    client_id: str,
    pkce: Pkce,
    *,
    redirect_uri: str | None = REDIRECT_URI,
    state: str | None = "state-123",
    resource: str | None = MCP_URL,
    scope: str | None = "spaces",
    method: str = "S256",
) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "code_challenge": pkce.challenge,
        "code_challenge_method": method,
    }
    optional = {"redirect_uri": redirect_uri, "state": state, "resource": resource, "scope": scope}
    params.update({key: value for key, value in optional.items() if value is not None})
    return f"/oauth/authorize?{urlencode(params)}"


def hidden_field(html: str, name: str) -> str:
    match = re.search(rf'name="{re.escape(name)}" value="([^"]*)"', html)
    assert match is not None, f"no hidden field named {name}"
    return match.group(1)


def query_of(location: str) -> dict[str, str]:
    return {key: values[0] for key, values in parse_qs(urlparse(location).query).items()}


def sign_in_for_consent(
    client: TestClient,
    runtime: Runtime,
    sender: RecordingSender,
    consent_location: str,
    email: str,
) -> Response:
    entry = client.get(consent_location)
    if entry.status_code == 200:
        return entry
    assert entry.status_code == 303
    sign_in_page = client.get(entry.headers["location"])
    next_path = hidden_field(sign_in_page.text, "next")
    client.post("/auth/sign-in", data={"email": email, "next": next_path})
    runtime.env.mailer.drain()
    verified = open_sign_in_link(client, sender.last_link(email))
    assert verified.status_code == 303
    return client.get(verified.headers["location"])


def decide(
    client: TestClient,
    consent_page: Response,
    decision: str = "allow",
    **overrides: str,
) -> Response:
    data = {
        "request": hidden_field(consent_page.text, "request"),
        "csrf": hidden_field(consent_page.text, "csrf"),
        "decision": decision,
        **overrides,
    }
    return client.post("/oauth/consent", data=data)


def run_consent(
    client: TestClient,
    runtime: Runtime,
    sender: RecordingSender,
    url: str,
    *,
    email: str = "alex@example.com",
    decision: str = "allow",
) -> Response:
    authorization = client.get(url)
    assert authorization.status_code == 302, authorization.text
    consent_page = sign_in_for_consent(
        client, runtime, sender, authorization.headers["location"], email
    )
    assert consent_page.status_code == 200, consent_page.text
    return decide(client, consent_page, decision)


def exchange(
    client: TestClient,
    client_id: str,
    code: str,
    verifier: str,
    *,
    redirect_uri: str = REDIRECT_URI,
    secret: str | None = None,
    resource: str | None = None,
) -> Response:
    data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
    }
    if secret is not None:
        data["client_secret"] = secret
    if resource is not None:
        data["resource"] = resource
    return client.post("/oauth/token", data=data)


def refresh(
    client: TestClient,
    client_id: str,
    refresh_token: str,
    *,
    secret: str | None = None,
    **extra: str,
) -> Response:
    data = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
        **extra,
    }
    if secret is not None:
        data["client_secret"] = secret
    return client.post("/oauth/token", data=data)


def connect(
    client: TestClient,
    runtime: Runtime,
    sender: RecordingSender,
    *,
    name: str = "ChatGPT",
    email: str = "alex@example.com",
) -> dict[str, Any]:
    registered = register(client, name=name)
    pkce = make_pkce()
    url = authorize_url(registered["client_id"], pkce)
    outcome = run_consent(client, runtime, sender, url, email=email)
    code = query_of(outcome.headers["location"])["code"]
    token_response = exchange(client, registered["client_id"], code, pkce.verifier)
    assert token_response.status_code == 200, token_response.text
    tokens: dict[str, Any] = token_response.json()
    return {"client_id": registered["client_id"], **tokens}


def mcp_rpc(
    client: TestClient, token: str | None, method: str, params: dict[str, Any] | None = None
) -> Response:
    headers = {"Accept": ACCEPT}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/mcp", json=body, headers=headers)


def mcp_tool_text(client: TestClient, token: str, name: str, arguments: dict[str, Any]) -> str:
    response = mcp_rpc(client, token, "tools/call", {"name": name, "arguments": arguments})
    assert response.status_code == 200, response.text
    content = response.json()["result"]["content"]
    return "\n".join(block["text"] for block in content)
