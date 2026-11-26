from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.errors import InvalidInput, NotAMember, TooLong
from orbit.limits import MEMORY_KEY_MAX, MEMORY_VALUE_MAX
from orbit.models import Memory
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import overview as overview_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
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


def test_setting_a_new_fact_stores_who_and_how(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    change = memory_service.set_fact(
        db, env, alex.via("ChatGPT"), space.id, "Dates", "Dec 20 to 23"
    )

    assert change.changed is True
    assert change.replaced_value is None
    assert change.fact.key == "Dates"
    assert change.fact.value == "Dec 20 to 23"
    assert change.fact.set_by_name == "Alex"
    assert change.fact.via == "ChatGPT"


def test_replacing_a_fact_keeps_history_and_reports_the_old_value(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    change = memory_service.set_fact(db, env, blake.via("Grok"), space.id, "Budget", "$3,500")

    assert change.replaced_value == "$3,000"
    current = memory_service.current_facts(db, space.id)
    assert [(fact.key, fact.value, fact.set_by_name) for fact in current] == [
        ("Budget", "$3,500", "Blake")
    ]
    history = memory_service.fact_history(db, space.id)
    assert [(row.value, row.superseded_at is not None) for row in history] == [
        ("$3,000", True),
        ("$3,500", False),
    ]
    assert history[0].set_by == alex.id
    assert history[1].set_by == blake.id


def test_setting_the_same_value_changes_nothing(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    change = memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,000")

    assert change.changed is False
    assert change.fact.set_by_name == "Alex"
    assert len(memory_service.fact_history(db, space.id)) == 1


def test_keys_match_case_insensitively_and_keep_their_first_spelling(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    memory_service.set_fact(db, env, alex.web(), space.id, "  budget ", "$4,000")

    current = memory_service.current_facts(db, space.id)
    assert [(fact.key, fact.value) for fact in current] == [("Budget", "$4,000")]


def test_facts_keep_the_order_they_were_first_set_in(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 21")

    keys = [fact.key for fact in memory_service.current_facts(db, space.id)]

    assert keys == ["Dates", "Budget"]


def test_at_most_one_current_row_exists_per_key(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    for value in ("one", "two", "three"):
        memory_service.set_fact(db, env, alex.web(), space.id, "Key", value)

    current_rows = db.scalars(
        select(Memory).where(Memory.space_id == space.id, Memory.superseded_at.is_(None))
    ).all()

    assert [row.value for row in current_rows] == ["three"]


def test_setting_a_fact_requires_membership(
    db: Session, env: Env, make: Factory, space: SpaceView
) -> None:
    outsider = make.user("carol@example.com").web()

    with pytest.raises(NotAMember):
        memory_service.set_fact(db, env, outsider, space.id, "Key", "Value")


@pytest.mark.parametrize(
    ("key", "value", "error"),
    [
        ("", "Value", InvalidInput),
        ("Key", "", InvalidInput),
        ("k" * (MEMORY_KEY_MAX + 1), "Value", TooLong),
        ("Key", "v" * (MEMORY_VALUE_MAX + 1), TooLong),
    ],
)
def test_facts_are_validated(
    db: Session,
    env: Env,
    alex: Person,
    space: SpaceView,
    key: str,
    value: str,
    error: type[Exception],
) -> None:
    actor = alex.web()

    with pytest.raises(error):
        memory_service.set_fact(db, env, actor, space.id, key, value)


def test_facts_accept_the_exact_limits(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    change = memory_service.set_fact(
        db, env, alex.web(), space.id, "k" * MEMORY_KEY_MAX, "v" * MEMORY_VALUE_MAX
    )

    assert change.changed is True


def test_space_context_collects_facts_recent_items_and_the_latest_plan(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20 to 23")
    for n in range(25):
        items_service.share_item(db, env, blake.web(), space.id, f"Item {n}", "Body")

    context = overview_service.get_space_context(db, alex.id, space.id, env.now())

    assert context.space.name == "Goa trip"
    assert [fact.key for fact in context.facts] == ["Dates"]
    assert len(context.recent_items) == 20
    assert context.recent_items[0].title == "Item 24"
    assert context.latest_plan is None


def test_space_context_requires_membership(
    db: Session, env: Env, make: Factory, space: SpaceView
) -> None:
    outsider = make.user("carol@example.com")

    with pytest.raises(NotAMember):
        overview_service.get_space_context(db, outsider.id, space.id, env.now())
