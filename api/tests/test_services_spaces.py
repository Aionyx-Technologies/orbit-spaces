from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from orbit.errors import (
    AmbiguousSpace,
    InvalidInput,
    LimitReached,
    NotAMember,
    NotFound,
    SpaceNotFound,
    TooLong,
)
from orbit.limits import SPACE_NAME_MAX, SPACES_PER_USER
from orbit.models import Space, SpaceMember
from orbit.services import spaces as spaces_service
from orbit.services.context import Env
from tests.conftest import Factory


def test_create_space_makes_creator_the_first_member(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com", "Alex")

    space = spaces_service.create_space(db, env, alex.web(), "  Goa   trip ")

    assert space.name == "Goa trip"
    assert space.created_by == alex.id
    assert [member.user_id for member in space.members] == [alex.id]
    assert space.members[0].display_name == "Alex"


def test_create_space_rejects_empty_and_long_names(db: Session, env: Env, make: Factory) -> None:
    actor = make.user("alex@example.com").web()
    too_long = "x" * (SPACE_NAME_MAX + 1)
    longest_allowed = "x" * SPACE_NAME_MAX

    with pytest.raises(InvalidInput):
        spaces_service.create_space(db, env, actor, "   ")
    with pytest.raises(TooLong):
        spaces_service.create_space(db, env, actor, too_long)
    assert spaces_service.create_space(db, env, actor, longest_allowed)


def test_create_space_enforces_the_per_user_limit(db: Session, env: Env, make: Factory) -> None:
    actor = make.user("alex@example.com").web()
    for index in range(SPACES_PER_USER):
        spaces_service.create_space(db, env, actor, f"Space {index}")

    with pytest.raises(LimitReached):
        spaces_service.create_space(db, env, actor, "One too many")


def test_deleted_spaces_do_not_count_toward_the_limit(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    first = spaces_service.create_space(db, env, alex.web(), "Space 0")
    for index in range(1, SPACES_PER_USER):
        spaces_service.create_space(db, env, alex.web(), f"Space {index}")
    first_row = db.get(Space, first.id)
    assert first_row is not None
    first_row.deleted_at = env.now()
    db.commit()

    assert spaces_service.create_space(db, env, alex.web(), "Fits now")


def test_list_spaces_returns_only_the_users_spaces_newest_first(
    db: Session, env: Env, make: Factory
) -> None:
    alex = make.user("alex@example.com", "Alex")
    blake = make.user("blake@example.com", "Blake")
    carol = make.user("carol@example.com", "Carol")
    older = make.space(alex, "Older", blake)
    newer = make.space(alex, "Newer")
    make.space(carol, "Private to Carol")

    spaces = spaces_service.list_spaces(db, alex.id)

    assert [space.id for space in spaces] == [newer.id, older.id]
    assert [member.display_name for member in spaces[1].members] == ["Alex", "Blake"]
    assert spaces_service.list_spaces(db, blake.id)[0].id == older.id


def test_list_spaces_hides_deleted_spaces(db: Session, env: Env, make: Factory) -> None:
    alex = make.user("alex@example.com")
    space = make.space(alex, "Gone soon")
    row = db.get(Space, space.id)
    assert row is not None
    row.deleted_at = env.now()
    db.commit()

    assert spaces_service.list_spaces(db, alex.id) == []


def test_require_member_distinguishes_missing_from_not_a_member(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")
    blake = make.user("blake@example.com")
    space = make.space(alex)

    assert spaces_service.require_member(db, alex.id, space.id).id == space.id
    with pytest.raises(NotAMember):
        spaces_service.require_member(db, blake.id, space.id)
    with pytest.raises(SpaceNotFound):
        spaces_service.require_member(db, alex.id, "00000000-0000-0000-0000-000000000000")


def test_get_space_view_requires_membership(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")
    blake = make.user("blake@example.com")
    space = make.space(alex)

    with pytest.raises(NotAMember):
        spaces_service.get_space_view(db, blake.id, space.id)


def test_resolve_space_id_uses_the_given_id(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")

    assert spaces_service.resolve_space_id(db, alex.id, " abc ") == "abc"


def test_resolve_space_id_defaults_to_the_only_space(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")
    space = make.space(alex)

    assert spaces_service.resolve_space_id(db, alex.id, None) == space.id
    assert spaces_service.resolve_space_id(db, alex.id, "  ") == space.id


def test_resolve_space_id_with_no_spaces_says_so(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")

    with pytest.raises(NotFound):
        spaces_service.resolve_space_id(db, alex.id, None)


def test_resolve_space_id_with_several_spaces_asks_which(db: Session, make: Factory) -> None:
    alex = make.user("alex@example.com")
    first = make.space(alex, "First")
    second = make.space(alex, "Second")

    with pytest.raises(AmbiguousSpace) as raised:
        spaces_service.resolve_space_id(db, alex.id, None)

    assert {space_id for space_id, _ in raised.value.spaces} == {first.id, second.id}


def test_created_space_cap_blocks_the_next_space(db: Session, env: Env, make: Factory) -> None:
    env.settings.max_created_spaces = 5
    actor = make.user("alex@example.com").web()
    for index in range(5):
        spaces_service.create_space(db, env, actor, f"Space {index}")

    with pytest.raises(LimitReached, match=r"You can create up to 5 spaces on the free plan."):
        spaces_service.create_space(db, env, actor, "One too many")


def test_created_cap_zero_is_unlimited(db: Session, env: Env, make: Factory) -> None:
    actor = make.user("alex@example.com").web()
    for index in range(6):
        spaces_service.create_space(db, env, actor, f"Space {index}")

    assert spaces_service.count_created_spaces(db, actor.user_id) == 6


def test_deleted_space_frees_a_created_slot(db: Session, env: Env, make: Factory) -> None:
    env.settings.max_created_spaces = 2
    actor = make.user("alex@example.com").web()
    first = spaces_service.create_space(db, env, actor, "Space 0")
    spaces_service.create_space(db, env, actor, "Space 1")
    first_row = db.get(Space, first.id)
    assert first_row is not None
    first_row.deleted_at = env.now()
    db.commit()

    assert spaces_service.create_space(db, env, actor, "Space 2")


def test_created_cap_counts_spaces_the_creator_left(db: Session, env: Env, make: Factory) -> None:
    env.settings.max_created_spaces = 1
    alex = make.user("alex@example.com")
    space = spaces_service.create_space(db, env, alex.web(), "Space 0")
    membership = db.get(SpaceMember, (space.id, alex.id))
    assert membership is not None
    db.delete(membership)
    db.commit()

    with pytest.raises(LimitReached):
        spaces_service.create_space(db, env, alex.web(), "Space 1")


def test_joining_a_space_does_not_use_a_created_slot(db: Session, env: Env, make: Factory) -> None:
    env.settings.max_created_spaces = 1
    alex = make.user("alex@example.com")
    blake = make.user("blake@example.com")
    make.space(alex, "Alex's space", blake)

    assert spaces_service.create_space(db, env, blake.web(), "Blake's space")
