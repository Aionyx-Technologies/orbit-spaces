from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import httpx2
import pytest
from fastapi import FastAPI
from mcp import Client
from mcp.client.auth.oauth2 import OAuthClientProvider
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import (
    AuthorizationCodeResult,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)
from sqlalchemy import select

from orbit.db import session_scope
from orbit.models import OAuthClient, User
from orbit.models import OAuthToken as TokenRow
from orbit.runtime import Runtime
from orbit.services import spaces as spaces_service
from orbit.services.context import Actor
from tests.conftest import BASE_URL, FakeFetcher, RecordingSender
from tests.mcp_helpers import text_of

pytestmark = pytest.mark.anyio

CALLBACK = "https://chatgpt.test/callback"
CIMD_URL = "https://client.example/oauth/metadata.json"
EMAIL = "alex@example.com"


class MemoryStorage:
    def __init__(self) -> None:
        self.tokens: OAuthToken | None = None
        self.client_info: OAuthClientInformationFull | None = None

    async def get_tokens(self) -> OAuthToken | None:
        return self.tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self.tokens = tokens

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        return self.client_info

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self.client_info = client_info


def field(html: str, name: str) -> str:
    match = re.search(rf'name="{name}" value="([^"]*)"', html)
    assert match is not None, f"missing {name}"
    return match.group(1)


class Person:
    def __init__(self, app: FastAPI, runtime: Runtime, sender: RecordingSender) -> None:
        self.runtime = runtime
        self.sender = sender
        self.http = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url=BASE_URL,
            follow_redirects=False,
            headers={"Origin": BASE_URL},
        )
        self.visits: list[str] = []

    async def approve(self, authorization_url: str) -> AuthorizationCodeResult:
        self.visits.append(authorization_url)
        authorize = await self.http.get(authorization_url)
        assert authorize.status_code == 302, authorize.text
        entry = await self.http.get(authorize.headers["location"])
        assert entry.status_code == 303
        sign_in = await self.http.get(entry.headers["location"])
        next_path = field(sign_in.text, "next")
        asked = await self.http.post("/auth/sign-in", data={"email": EMAIL, "next": next_path})
        assert asked.status_code == 200
        self.runtime.env.mailer.drain()
        link = parse_qs(urlparse(self.sender.last_link(EMAIL)).query)
        verified = await self.http.post(
            "/auth/verify", data={"token": link["token"][0], "next": link["next"][0]}
        )
        assert verified.status_code == 303
        consent = await self.http.get(verified.headers["location"])
        assert consent.status_code == 200
        decision = await self.http.post(
            "/oauth/consent",
            data={
                "request": field(consent.text, "request"),
                "csrf": field(consent.text, "csrf"),
                "decision": "allow",
            },
        )
        assert decision.status_code == 303
        query = parse_qs(urlparse(decision.headers["location"]).query)
        return AuthorizationCodeResult(
            code=query["code"][0], state=query["state"][0], iss=query["iss"][0]
        )


def metadata(**overrides: Any) -> OAuthClientMetadata:
    values: dict[str, Any] = {
        "client_name": "ChatGPT",
        "redirect_uris": [CALLBACK],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": "spaces",
    }
    values.update(overrides)
    return OAuthClientMetadata.model_validate(values)


@asynccontextmanager
async def connected(
    app: FastAPI,
    runtime: Runtime,
    sender: RecordingSender,
    *,
    client_metadata: OAuthClientMetadata,
    client_metadata_url: str | None = None,
) -> AsyncIterator[tuple[Client, MemoryStorage, Person, OAuthClientProvider]]:
    person = Person(app, runtime, sender)
    storage = MemoryStorage()
    pending: list[str] = []

    async def redirect_handler(url: str) -> None:
        pending.append(url)

    async def callback_handler() -> AuthorizationCodeResult:
        return await person.approve(pending.pop())

    provider = OAuthClientProvider(
        server_url=f"{BASE_URL}/mcp",
        client_metadata=client_metadata,
        storage=storage,
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
        client_metadata_url=client_metadata_url,
    )
    sdk_http = httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url=BASE_URL, auth=provider
    )
    async with (
        app.router.lifespan_context(app),
        sdk_http,
        person.http,
        Client(
            streamable_http_client(f"{BASE_URL}/mcp", http_client=sdk_http), mode="legacy"
        ) as client,
    ):
        yield client, storage, person, provider


async def test_a_real_client_connects_by_dynamic_registration_and_shares_something(
    app: FastAPI, runtime: Runtime, sender: RecordingSender
) -> None:
    async with connected(app, runtime, sender, client_metadata=metadata()) as (
        client,
        storage,
        person,
        _provider,
    ):
        first = await client.call_tool("list_spaces", {})
        with session_scope(runtime.session_factory) as db:
            user = db.scalars(select(User)).one()
            spaces_service.create_space(db, runtime.env, Actor.web(user.id), "Goa trip")
        shared = await client.call_tool(
            "share_to_space", {"title": "Flight", "content": "Leaves at 7:10"}
        )
        context = await client.call_tool("get_space_context", {})

    assert "not in any Orbit space" in text_of(first)
    assert shared.is_error is not True
    body = text_of(context)
    assert "Leaves at 7:10" in body
    assert "Content shared by Alex via ChatGPT" in body
    assert len(person.visits) == 1
    assert storage.client_info is not None
    assert storage.tokens is not None
    assert storage.tokens.refresh_token
    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(OAuthClient)).one()
        token = db.scalars(select(TokenRow)).one()
    assert row.registration_type == "dcr"
    assert token.resource == f"{BASE_URL}/mcp"


async def test_a_real_client_connects_with_a_client_metadata_url(
    app: FastAPI, runtime: Runtime, sender: RecordingSender, fetcher: FakeFetcher
) -> None:
    fetcher.documents[CIMD_URL] = {
        "client_id": CIMD_URL,
        "client_name": "Grok",
        "redirect_uris": [CALLBACK],
        "token_endpoint_auth_method": "none",
    }
    async with connected(
        app,
        runtime,
        sender,
        client_metadata=metadata(client_name="Grok"),
        client_metadata_url=CIMD_URL,
    ) as (client, storage, person, _provider):
        listed = await client.call_tool("list_spaces", {})

    assert listed.is_error is not True
    assert len(person.visits) == 1
    assert storage.client_info is not None
    assert storage.client_info.client_id == CIMD_URL
    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(OAuthClient)).one()
    assert row.registration_type == "cimd"
    assert row.client_name == "Grok"


async def test_a_real_client_keeps_working_after_the_access_token_expires(
    app: FastAPI, runtime: Runtime, sender: RecordingSender, clock: Any
) -> None:
    async with connected(app, runtime, sender, client_metadata=metadata()) as (
        client,
        storage,
        person,
        provider,
    ):
        await client.call_tool("list_spaces", {})
        assert storage.tokens is not None
        first_refresh = storage.tokens.refresh_token
        clock.advance(minutes=61)
        provider.context.token_expiry_time = time.time() - 1
        after = await client.call_tool("list_spaces", {})

    assert after.is_error is not True
    assert len(person.visits) == 1
    assert storage.tokens is not None
    assert storage.tokens.refresh_token != first_refresh
    with session_scope(runtime.session_factory) as db:
        rows = db.scalars(select(TokenRow).order_by(TokenRow.created_at)).all()
    assert len(rows) == 2
    assert rows[0].revoked_at is not None
    assert rows[1].revoked_at is None
