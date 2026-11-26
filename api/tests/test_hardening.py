from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from orbit.config import Settings
from orbit.headers import ApiNoStoreMiddleware
from orbit.limits import COMBINE_MAX_CONCURRENT, MAX_REQUEST_BODY_BYTES
from orbit.main import Overrides, create_app
from orbit.runtime import Runtime
from tests.combine_helpers import FakeCombiner
from tests.conftest import SECRET_KEY, FakeClock, FakeFetcher, RecordingSender
from tests.rest_helpers import People, create_space, share

ALEX = "alex@example.com"
sqlite_only = pytest.mark.skipif(
    bool(os.environ.get("TEST_DATABASE_URL")),
    reason="SQLite's write lock does not exist on Postgres",
)
JSON_HEADERS = {"Content-Type": "application/json"}


@pytest.fixture
def fake_llm() -> FakeCombiner:
    return FakeCombiner()


@pytest.fixture
def app(
    settings: Settings,
    clock: FakeClock,
    sender: RecordingSender,
    fetcher: FakeFetcher,
    fake_llm: FakeCombiner,
) -> FastAPI:
    return create_app(
        settings, overrides=Overrides(clock=clock, sender=sender, fetcher=fetcher, llm=fake_llm)
    )


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


@pytest.fixture
def statements(runtime: Runtime) -> Iterator[list[str]]:
    seen: list[str] = []

    def record(*arguments: Any) -> None:
        seen.append(str(arguments[2]))

    event.listen(runtime.engine, "before_cursor_execute", record)
    yield seen
    event.remove(runtime.engine, "before_cursor_execute", record)


def begins(statements: list[str]) -> set[str]:
    return {statement for statement in statements if statement.startswith("BEGIN")}


def test_a_huge_json_body_is_refused_before_anyone_reads_it(client: TestClient) -> None:
    padding = b"a" * (MAX_REQUEST_BODY_BYTES + 1)

    response = client.post(
        "/api/spaces", content=b'{"name":"' + padding + b'"}', headers=JSON_HEADERS
    )

    assert response.status_code == 413


def test_a_streamed_body_is_cut_off_at_the_limit(client: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(MAX_REQUEST_BODY_BYTES // 1024 + 2):
            yield b"a" * 1024

    response = client.post("/api/spaces", content=chunks(), headers=JSON_HEADERS)

    assert response.status_code == 413


def test_the_limit_also_covers_the_sign_in_form(client: TestClient) -> None:
    response = client.post("/auth/sign-in", data={"email": "a" * (MAX_REQUEST_BODY_BYTES + 1)})

    assert response.status_code == 413


def test_normal_sized_requests_still_get_through(people: People) -> None:
    created = create_space(people.as_(ALEX), "Goa trip")
    shared = share(people.as_(ALEX), created["id"], "Hotels", "x" * 20_000)

    assert shared["content"] == "x" * 20_000


def no_store_client() -> TestClient:
    async def plain(_request: Request) -> JSONResponse:
        return JSONResponse({})

    async def streaming(_request: Request) -> JSONResponse:
        return JSONResponse({}, headers={"Cache-Control": "no-cache, no-transform"})

    app = Starlette(
        routes=[
            Route("/api/plain", plain),
            Route("/api/stream", streaming),
            Route("/page", plain),
        ]
    )
    app.add_middleware(ApiNoStoreMiddleware)
    return TestClient(app)


def test_api_answers_are_marked_as_not_to_be_stored() -> None:
    assert no_store_client().get("/api/plain").headers["cache-control"] == "no-store"


def test_an_api_answer_that_chooses_its_own_caching_keeps_it() -> None:
    response = no_store_client().get("/api/stream")

    assert response.headers["cache-control"] == "no-cache, no-transform"


def test_pages_outside_the_api_are_left_alone() -> None:
    assert "cache-control" not in no_store_client().get("/page").headers


def test_the_real_api_does_not_let_anything_be_cached(client: TestClient, people: People) -> None:
    assert client.get("/api/health").headers["cache-control"] == "no-store"
    assert people.anonymous().get("/api/me").headers["cache-control"] == "no-store"
    assert people.as_(ALEX).get("/api/me").headers["cache-control"] == "no-store"


@sqlite_only
def test_reads_do_not_take_the_database_write_lock(people: People, statements: list[str]) -> None:
    client = people.as_(ALEX)
    statements.clear()

    assert client.get("/api/me").status_code == 200
    assert client.get("/api/spaces").status_code == 200

    assert begins(statements) == {"BEGIN DEFERRED"}


@sqlite_only
def test_writes_still_take_the_write_lock_before_reading_anything(
    people: People, statements: list[str]
) -> None:
    client = people.as_(ALEX)
    statements.clear()

    create_space(client)

    assert "BEGIN IMMEDIATE" in begins(statements)


@sqlite_only
def test_the_health_check_never_takes_the_write_lock(
    client: TestClient, statements: list[str]
) -> None:
    assert client.get("/api/health").status_code == 200

    assert begins(statements) == {"BEGIN DEFERRED"}


def test_combining_is_refused_while_orbit_is_busy_with_other_spaces(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    share(people.as_(ALEX), space["id"], "Hotels", "Three options")
    for index in range(COMBINE_MAX_CONCURRENT):
        assert runtime.env.combines.try_acquire(f"busy-{index}")

    busy = people.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={})
    runtime.env.combines.release("busy-0")
    free = people.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={})

    assert busy.status_code == 409
    assert "busy combining other spaces" in busy.json()["error"]["message"]
    assert free.status_code == 200


def test_combining_the_same_space_twice_at_once_says_so(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    share(people.as_(ALEX), space["id"], "Hotels", "Three options")
    assert runtime.env.combines.try_acquire(space["id"])

    response = people.as_(ALEX).post(f"/api/spaces/{space['id']}/combine", json={})

    assert response.status_code == 409
    assert "already combining this space" in response.json()["error"]["message"]


def build_app(tmp_path: Path, **overrides: Any) -> None:
    create_app(
        Settings(
            _env_file=None,
            secret_key=SECRET_KEY,
            database_url=f"sqlite:///{tmp_path / 'warning.db'}",
            **overrides,
        ),
        run_db_migrations=False,
    )


def test_a_public_server_without_mail_settings_warns_that_emails_go_to_the_log(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        build_app(tmp_path, base_url="https://orbit.example.com")

    assert "Neither SMTP_HOST nor RESEND_API_KEY is set" in caplog.text


def test_a_local_server_without_mail_settings_stays_quiet(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        build_app(tmp_path, base_url="http://localhost")

    assert "SMTP_HOST" not in caplog.text


def test_a_public_server_with_a_mail_server_stays_quiet(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        build_app(tmp_path, base_url="https://orbit.example.com", smtp_host="mail.example.com")

    assert "SMTP_HOST" not in caplog.text


def test_a_public_server_with_a_resend_key_stays_quiet(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        build_app(tmp_path, base_url="https://orbit.example.com", resend_api_key="re_test")

    assert "SMTP_HOST" not in caplog.text
