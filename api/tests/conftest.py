from __future__ import annotations

import os
import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.db import (
    SessionFactory,
    create_db_engine,
    create_session_factory,
    normalize_database_url,
    run_migrations,
    session_scope,
)
from orbit.email import EmailMessage
from orbit.main import Overrides, create_app
from orbit.models import SpaceMember, User, new_id
from orbit.oauth.cimd import CimdError
from orbit.principal import Principal
from orbit.runtime import Runtime
from orbit.security import display_name_from_email
from orbit.services import spaces as spaces_service
from orbit.services.context import Actor, Env
from orbit.services.views import SpaceView

SECRET_KEY = "test-secret-key-test-secret-key-0123456789"
BASE_URL = "https://orbit.test"


class FakeClock:
    def __init__(self) -> None:
        self.current = datetime.now(UTC).replace(microsecond=0)

    def __call__(self) -> datetime:
        value = self.current
        self.current = value + timedelta(seconds=1)
        return value

    def advance(self, **kwargs: float) -> None:
        self.current += timedelta(**kwargs)


AI_ENVIRONMENT = (
    "ANTHROPIC_API_KEY",
    "COMBINE_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_USE_VERTEX",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "ORBIT_AI_PROVIDER",
)


@pytest.fixture(autouse=True)
def no_ai_settings_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in AI_ENVIRONMENT:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(params=["asyncio"])
def anyio_backend(request: pytest.FixtureRequest) -> str:
    return str(request.param)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    """A fresh, empty database for one test.

    SQLite by default. Set TEST_DATABASE_URL to a Postgres URL to run the suite there; each test
    then gets its own schema, which is dropped afterwards.
    """
    admin_url = os.environ.get("TEST_DATABASE_URL", "")
    if not admin_url:
        yield f"sqlite:///{tmp_path / 'orbit.db'}"
        return
    schema = f"t_{uuid.uuid4().hex}"
    admin = create_db_engine(admin_url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        yield (
            normalize_database_url(admin_url)
            .update_query_dict({"options": f"-csearch_path={schema}"})
            .render_as_string(hide_password=False)
        )
    finally:
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        base_url=BASE_URL,
        secret_key=SECRET_KEY,
        database_url=database_url,
    )


@pytest.fixture
def engine(settings: Settings) -> Iterator[Engine]:
    run_migrations(settings.database_url)
    engine = create_db_engine(settings.database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> SessionFactory:
    return create_session_factory(engine)


@pytest.fixture
def env(settings: Settings, clock: FakeClock) -> Env:
    return Env(settings=settings, clock=clock)


@pytest.fixture
def db(session_factory: SessionFactory) -> Iterator[Session]:
    with session_scope(session_factory) as session:
        yield session


@dataclass
class Person:
    id: str
    email: str
    name: str

    def web(self) -> Actor:
        return Actor.web(self.id)

    def via(self, client_name: str) -> Actor:
        return Actor.assistant(self.id, client_name)

    def principal(self, client_name: str = "TestAssistant") -> Principal:
        return Principal(user_id=self.id, client_name=client_name)


class Factory:
    def __init__(self, db: Session, env: Env) -> None:
        self.db = db
        self.env = env

    def user(self, email: str, name: str | None = None) -> Person:
        display = name or display_name_from_email(email)
        user = User(id=new_id(), email=email, display_name=display, created_at=self.env.now())
        self.db.add(user)
        self.db.commit()
        return Person(id=user.id, email=email, name=display)

    def space(self, owner: Person, name: str = "Goa trip", *members: Person) -> SpaceView:
        space = spaces_service.create_space(self.db, self.env, owner.web(), name)
        for member in members:
            self.db.add(
                SpaceMember(
                    space_id=space.id,
                    user_id=member.id,
                    joined_at=self.env.now(),
                    notify_email=True,
                )
            )
        self.db.commit()
        view = spaces_service.get_space_view(self.db, owner.id, space.id)
        self.db.commit()
        return view


@pytest.fixture
def make(db: Session, env: Env) -> Factory:
    return Factory(db, env)


class RecordingSender:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.messages.append(message)

    def to(self, address: str) -> list[EmailMessage]:
        return [message for message in self.messages if message.to == address]

    def last_link(self, address: str) -> str:
        message = self.to(address)[-1]
        match = re.search(r"https?://\S+", message.text)
        assert match is not None
        return match.group(0)


class FakeFetcher:
    def __init__(self) -> None:
        self.documents: dict[str, dict[str, Any]] = {}
        self.calls: list[str] = []
        self.failing = False

    async def fetch(self, url: str) -> dict[str, Any]:
        self.calls.append(url)
        if self.failing or url not in self.documents:
            raise CimdError("The client metadata document could not be fetched.")
        return self.documents[url]


@pytest.fixture
def sender() -> RecordingSender:
    return RecordingSender()


@pytest.fixture
def fetcher() -> FakeFetcher:
    return FakeFetcher()


@pytest.fixture
def app(
    settings: Settings, clock: FakeClock, sender: RecordingSender, fetcher: FakeFetcher
) -> FastAPI:
    return create_app(settings, overrides=Overrides(clock=clock, sender=sender, fetcher=fetcher))


@pytest.fixture
def runtime(app: FastAPI) -> Runtime:
    runtime: Runtime = app.state.runtime
    return runtime


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(
        app, base_url=BASE_URL, follow_redirects=False, headers={"Origin": BASE_URL}
    ) as test_client:
        yield test_client
