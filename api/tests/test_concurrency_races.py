"""Races that SQLite's single writer used to hide and Postgres lets through.

Each test fakes the losing side of a race by handing the code a stale read, then checks that the
code recovers. They run on both backends, because the unique constraints exist on both.
"""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.auth import magic_links
from orbit.errors import FactNameTaken
from orbit.models import Memory, SpaceMember, Waitlist
from orbit.services import invites as invites_service
from orbit.services import memory as memory_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.conftest import Factory, Person


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com")


@pytest.fixture
def space(make: Factory, alex: Person, blake: Person) -> SpaceView:
    return make.space(alex, "Goa trip", blake)


def live_values(db: Session, space_id: str) -> list[str]:
    return [
        row.value
        for row in db.scalars(
            select(Memory).where(Memory.space_id == space_id, Memory.superseded_at.is_(None))
        )
    ]


def test_setting_a_fact_someone_else_just_added_becomes_an_edit(
    db: Session,
    env: Env,
    alex: Person,
    blake: Person,
    space: SpaceView,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    real = memory_service._live_rows
    calls = {"count": 0}

    def stale_first_read(session: Session, space_id: str) -> list[Memory]:
        calls["count"] += 1
        if calls["count"] == 1:
            memory_service.set_fact(session, env, blake.web(), space_id, "Dates", "May")
            session.expire_all()
            return []
        return real(session, space_id)

    monkeypatch.setattr(memory_service, "_live_rows", stale_first_read)

    change = memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "June")

    assert change.changed is True
    assert change.replaced_value == "May"
    assert live_values(db, space.id) == ["June"]


def test_renaming_onto_a_name_taken_a_moment_ago_is_a_clear_conflict(
    db: Session,
    env: Env,
    alex: Person,
    blake: Person,
    space: SpaceView,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "May")
    real = memory_service._live_rows
    calls = {"count": 0}

    def stale_clash_check(session: Session, space_id: str) -> list[Memory]:
        calls["count"] += 1
        rows = real(session, space_id)
        if calls["count"] == 1:
            return rows
        if calls["count"] == 2:
            memory_service.set_fact(session, env, blake.web(), space_id, "When", "June")
            session.expire_all()
            return rows
        return real(session, space_id)

    monkeypatch.setattr(memory_service, "_live_rows", stale_clash_check)

    with pytest.raises(FactNameTaken):
        memory_service.rename_fact(db, env, alex.web(), space.id, "Dates", "When")

    assert sorted(live_values(db, space.id)) == ["June", "May"]


def test_joining_the_waitlist_twice_keeps_one_row(db: Session, env: Env) -> None:
    magic_links.join_waitlist(db, env, "Friend@Example.com", "203.0.113.1")
    magic_links.join_waitlist(db, env, "friend@example.com", "203.0.113.2")

    assert db.scalar(select(func.count()).select_from(Waitlist)) == 1


def test_signing_in_as_someone_created_a_moment_ago_finds_them(
    db: Session, env: Env, make: Factory, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing = make.user("new@example.com")
    real = magic_links._find_user
    calls = {"count": 0}

    def stale_first_lookup(session: Session, email: str) -> Any:
        calls["count"] += 1
        return None if calls["count"] == 1 else real(session, email)

    monkeypatch.setattr(magic_links, "_find_user", stale_first_lookup)

    user = magic_links._user_for(db, "new@example.com", env.now())

    assert user.id == existing.id


def test_accepting_a_second_invite_to_a_space_you_just_joined_is_not_an_error(
    db: Session,
    env: Env,
    make: Factory,
    alex: Person,
    blake: Person,
    space: SpaceView,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    carol = make.user("carol@example.com")
    first = invites_service.create_invite(db, env, alex.web(), space.id, None)
    second = invites_service.create_invite(db, env, alex.web(), space.id, None)
    token_of = lambda created: created.url.rsplit("/", 1)[1]  # noqa: E731
    invites_service.accept_invite(db, env, carol.id, token_of(first))
    monkeypatch.setattr(invites_service, "_is_member", lambda *_: False)

    result = invites_service.accept_invite(db, env, carol.id, token_of(second))

    assert result.already_member is True
    members = db.scalar(
        select(func.count()).select_from(SpaceMember).where(SpaceMember.space_id == space.id)
    )
    assert members == 3
