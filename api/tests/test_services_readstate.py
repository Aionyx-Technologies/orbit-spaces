from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from orbit.errors import NotAMember
from orbit.limits import NEW_LIST_MAX
from orbit.models import Item, SpaceMember, new_id
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import readstate as readstate_service
from orbit.services.context import AUTHOR_ORBIT, KIND_PLAN, Env
from orbit.services.views import NewActivity, SpaceView
from tests.conftest import Factory, Person


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def space(make: Factory, alex: Person, blake: Person) -> SpaceView:
    return make.space(alex, "Goa trip", blake)


def add_plan(db: Session, env: Env, space: SpaceView) -> None:
    db.add(
        Item(
            id=new_id(),
            space_id=space.id,
            kind=KIND_PLAN,
            title="Combined plan",
            content="Stay at Hotel 2.",
            author_kind=AUTHOR_ORBIT,
            shared_by=None,
            via="ChatGPT",
            source_item_ids=[],
            created_at=env.now(),
        )
    )
    db.commit()


def looked(db: Session, env: Env, person: Person, space: SpaceView) -> None:
    readstate_service.mark_read(db, person.id, space.id, env.now())


def counts(db: Session, person: Person, space: SpaceView) -> int:
    return readstate_service.new_counts(db, person.id, [space.id])[space.id]


def activity_for(db: Session, person: Person, space: SpaceView) -> NewActivity:
    since = readstate_service.last_read_at(db, person.id, space.id)
    return readstate_service.new_activity(db, person.id, space.id, since)


def test_a_member_who_has_never_looked_has_nothing_new(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    items_service.share_item(db, env, blake.web(), space.id, "Hotels", "Body")

    activity = activity_for(db, alex, space)

    assert counts(db, alex, space) == 0
    assert activity.first_look is True
    assert activity.total == 0


def test_what_others_share_after_a_look_is_new_and_looking_again_clears_it(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    items_service.share_item(db, env, blake.web(), space.id, "Hotels", "Body")
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 20")

    assert counts(db, alex, space) == 2

    looked(db, env, alex, space)

    assert counts(db, alex, space) == 0


def test_a_persons_own_items_and_facts_are_never_new_to_them(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    items_service.share_item(db, env, alex.web(), space.id, "Flights", "Body")
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    assert counts(db, alex, space) == 0


def test_a_fact_the_person_replaced_is_no_longer_new_for_them(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 19")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")

    assert counts(db, alex, space) == 0


def test_a_fact_changed_twice_by_someone_else_counts_once(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 19")
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 20")

    activity = activity_for(db, alex, space)

    assert counts(db, alex, space) == 1
    assert [fact.value for fact in activity.facts] == ["Dec 20"]


def test_a_retracted_item_is_not_new(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    shared = items_service.share_item(db, env, blake.web(), space.id, "Oops", "Body")
    items_service.retract_item(db, env, blake.web(), shared.id)

    assert counts(db, alex, space) == 0


def test_a_plan_written_by_orbit_is_new_for_every_member(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    looked(db, env, blake, space)
    add_plan(db, env, space)

    activity = activity_for(db, blake, space)

    assert counts(db, alex, space) == 1
    assert counts(db, blake, space) == 1
    assert [plan.title for plan in activity.plans] == ["Combined plan"]
    assert activity.items == []


def test_reading_state_is_kept_per_person(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    looked(db, env, blake, space)
    items_service.share_item(db, env, alex.web(), space.id, "Flights", "Body")
    items_service.share_item(db, env, blake.web(), space.id, "Hotels", "Body")

    looked(db, env, alex, space)

    assert counts(db, alex, space) == 0
    assert counts(db, blake, space) == 1


def test_counts_cover_several_spaces_in_one_call(
    db: Session, env: Env, make: Factory, alex: Person, blake: Person, space: SpaceView
) -> None:
    other = make.space(alex, "Ski trip", blake)
    looked(db, env, alex, space)
    looked(db, env, alex, other)
    items_service.share_item(db, env, blake.web(), space.id, "One", "Body")
    items_service.share_item(db, env, blake.web(), other.id, "Two", "Body")
    items_service.share_item(db, env, blake.web(), other.id, "Three", "Body")

    result = readstate_service.new_counts(db, alex.id, [space.id, other.id])

    assert result[space.id] == 1
    assert result[other.id] == 2
    assert readstate_service.new_counts(db, alex.id, []) == {}


def test_a_long_list_of_new_things_is_cut_but_still_counted(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    looked(db, env, alex, space)
    for number in range(NEW_LIST_MAX + 5):
        items_service.share_item(db, env, blake.web(), space.id, f"Item {number}", "Body")

    activity = activity_for(db, alex, space)

    assert len(activity.items) == NEW_LIST_MAX
    assert activity.omitted == 5
    assert activity.total == NEW_LIST_MAX + 5
    assert activity.items[0].title == f"Item {NEW_LIST_MAX + 4}"


def test_marking_read_never_moves_the_mark_backwards(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    later = env.now() + timedelta(hours=1)
    readstate_service.mark_read(db, alex.id, space.id, later)

    readstate_service.mark_read(db, alex.id, space.id, later - timedelta(minutes=30))

    assert readstate_service.last_read_at(db, alex.id, space.id) == later


def test_only_members_can_mark_a_space_read(
    db: Session, env: Env, make: Factory, space: SpaceView
) -> None:
    outsider = make.user("carol@example.com")
    now = env.now()

    with pytest.raises(NotAMember):
        readstate_service.mark_read(db, outsider.id, space.id, now)

    assert db.get(SpaceMember, (space.id, outsider.id)) is None
