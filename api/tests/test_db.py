from __future__ import annotations

from dataclasses import dataclass

import pytest
from sqlalchemy import select, text

from orbit.db import (
    POSTGRES_POOL_RECYCLE_SECONDS,
    POSTGRES_POOL_SIZE,
    SessionFactory,
    create_db_engine,
    normalize_database_url,
    session_scope,
)
from orbit.models import User, new_id
from orbit.timeutil import utcnow


@dataclass(frozen=True)
class FrozenProblem(Exception):
    reason: str


class Marker(Exception):
    pass


def new_user(email: str) -> User:
    return User(id=new_id(), email=email, display_name="X", created_at=utcnow())


def commit_user(factory: SessionFactory, email: str) -> None:
    with session_scope(factory) as db:
        db.add(new_user(email))
        db.commit()


def fail_inside_scope(factory: SessionFactory, error: BaseException) -> None:
    with session_scope(factory) as db:
        db.execute(text("SELECT 1"))
        raise error


def write_then_fail(factory: SessionFactory) -> None:
    with session_scope(factory) as db:
        db.add(new_user("gone@example.com"))
        db.flush()
        raise RuntimeError("boom")


def test_a_frozen_exception_passes_through_a_session_scope_unchanged(
    session_factory: SessionFactory,
) -> None:
    problem = FrozenProblem("nope")

    with pytest.raises(FrozenProblem) as raised:
        fail_inside_scope(session_factory, problem)

    assert raised.value is problem


def test_an_error_rolls_back_uncommitted_work(session_factory: SessionFactory) -> None:
    with pytest.raises(RuntimeError):
        write_then_fail(session_factory)

    with session_scope(session_factory) as db:
        assert db.scalars(select(User)).all() == []


def test_committed_work_survives_the_scope(session_factory: SessionFactory) -> None:
    commit_user(session_factory, "kept@example.com")

    with session_scope(session_factory) as db:
        assert [user.email for user in db.scalars(select(User))] == ["kept@example.com"]


def test_a_scope_never_swallows_errors(session_factory: SessionFactory) -> None:
    with pytest.raises(Marker):
        fail_inside_scope(session_factory, Marker())


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_postgres_urls_open_with_the_psycopg_3_driver(scheme: str) -> None:
    url = normalize_database_url(f"{scheme}://orbit:secret@db.internal:5432/orbit")

    assert url.drivername == "postgresql+psycopg"
    assert url.password == "secret"
    assert url.host == "db.internal"


def test_other_database_urls_are_left_alone() -> None:
    assert normalize_database_url("sqlite:///./orbit.db").drivername == "sqlite"


def test_a_postgres_engine_uses_a_small_checked_pool() -> None:
    engine = create_db_engine("postgresql://orbit:secret@db.internal:5432/orbit")

    assert engine.pool.size() == POSTGRES_POOL_SIZE  # type: ignore[attr-defined]
    assert engine.pool._pre_ping is True  # type: ignore[attr-defined]
    assert engine.pool._recycle == POSTGRES_POOL_RECYCLE_SECONDS  # type: ignore[attr-defined]
    engine.dispose()
