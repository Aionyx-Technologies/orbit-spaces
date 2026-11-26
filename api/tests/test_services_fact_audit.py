from __future__ import annotations

import re

import pytest
from sqlalchemy.orm import Session

from orbit.errors import FactNameTaken, FactNotFound, InvalidInput, NotAMember, TooLong
from orbit.events import MEMORY_SET, SpaceEvent
from orbit.limits import MEMORY_KEY_MAX
from orbit.models import Memory
from orbit.services import export as export_service
from orbit.services import memory as memory_service
from orbit.services import overview as overview_service
from orbit.services import previews as previews_service
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


def rows_of(db: Session, space_id: str) -> list[Memory]:
    return memory_service.fact_history(db, space_id)


def current_keys(db: Session, space_id: str) -> list[str]:
    return [fact.key for fact in memory_service.current_facts(db, space_id)]


def test_a_new_fact_is_an_add_and_a_new_value_is_an_edit_of_the_same_fact(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "budget", "$3,500")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")

    rows = rows_of(db, space.id)

    assert [(row.key, row.action) for row in rows] == [
        ("Budget", "add"),
        ("Budget", "edit"),
        ("Dates", "add"),
    ]
    assert rows[0].fact_id == rows[1].fact_id != rows[2].fact_id
    assert all(row.previous_key is None for row in rows)


def test_renaming_keeps_the_value_the_place_and_the_fact_id_and_records_who(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    change = memory_service.rename_fact(
        db, env, blake.via("Claude"), space.id, " dates ", "Trip   dates"
    )

    assert change.changed is True
    assert change.replaced_value is None
    assert (change.fact.key, change.fact.value) == ("Trip dates", "Dec 20")
    assert (change.fact.set_by_name, change.fact.via) == ("Blake", "Claude")
    current = memory_service.current_facts(db, space.id)
    assert [(fact.key, fact.value) for fact in current] == [
        ("Trip dates", "Dec 20"),
        ("Budget", "$3,000"),
    ]
    rows = rows_of(db, space.id)
    assert (rows[-1].action, rows[-1].previous_key) == ("rename", "Dates")
    assert rows[-1].fact_id == rows[0].fact_id
    assert rows[0].superseded_at is not None


def test_renaming_to_the_same_name_changes_nothing_but_a_new_spelling_counts(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    same = memory_service.rename_fact(db, env, alex.web(), space.id, "budget", "Budget")
    respelled = memory_service.rename_fact(db, env, alex.web(), space.id, "Budget", "BUDGET")

    assert same.changed is False
    assert same.fact.key == "Budget"
    assert respelled.changed is True
    assert current_keys(db, space.id) == ["BUDGET"]
    assert len(rows_of(db, space.id)) == 2


def test_renaming_onto_another_facts_name_is_a_conflict(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Cost", "$2,000")

    with pytest.raises(FactNameTaken, match=re.escape("There is already a fact called “budget”.")):
        memory_service.rename_fact(db, env, alex.web(), space.id, "Cost", "budget")

    assert FactNameTaken.status == 409
    assert len(rows_of(db, space.id)) == 2


def test_renaming_deleting_or_reading_a_missing_fact_is_not_found(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    with pytest.raises(FactNotFound, match=re.escape("There is no fact called “Nope”.")):
        memory_service.rename_fact(db, env, alex.web(), space.id, "Nope", "Other")
    with pytest.raises(FactNotFound):
        memory_service.delete_fact(db, env, alex.web(), space.id, "Nope")
    with pytest.raises(FactNotFound):
        memory_service.fact_events(db, alex.id, space.id, "Nope")
    assert FactNotFound.status == 404


def test_rename_delete_and_history_require_membership(
    db: Session, env: Env, make: Factory, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    outsider = make.user("carol@example.com")

    with pytest.raises(NotAMember):
        memory_service.rename_fact(db, env, outsider.web(), space.id, "Budget", "Cost")
    with pytest.raises(NotAMember):
        memory_service.delete_fact(db, env, outsider.web(), space.id, "Budget")
    with pytest.raises(NotAMember):
        memory_service.fact_events(db, outsider.id, space.id, None)


def test_a_rename_needs_a_valid_new_name(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")

    with pytest.raises(InvalidInput):
        memory_service.rename_fact(db, env, alex.web(), space.id, "Budget", "  ")
    with pytest.raises(TooLong):
        memory_service.rename_fact(
            db, env, alex.web(), space.id, "Budget", "k" * (MEMORY_KEY_MAX + 1)
        )


def test_deleting_leaves_a_tombstone_that_is_never_current(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")

    memory_service.delete_fact(db, env, blake.via("Claude"), space.id, "BUDGET")

    assert current_keys(db, space.id) == ["Dates"]
    tombstone = rows_of(db, space.id)[-1]
    assert (tombstone.action, tombstone.key, tombstone.value) == ("delete", "Budget", "$3,000")
    assert (tombstone.set_by, tombstone.via) == (blake.id, "Claude")
    assert tombstone.superseded_at == tombstone.created_at
    context = overview_service.get_space_context(db, alex.id, space.id, env.now())
    assert [fact.key for fact in context.facts] == ["Dates"]
    preview = previews_service.preview_spaces(db, [space])[space.id]
    assert preview.fact_count == 1
    assert [highlight.key for highlight in preview.highlights] == ["Dates"]
    exported = export_service.export_space(db, env, alex.id, space.id)
    assert [entry["key"] for entry in exported["memory"]["current"]] == ["Dates"]
    assert [entry["action"] for entry in exported["memory"]["history"]] == [
        "add",
        "add",
        "delete",
    ]
    with pytest.raises(FactNotFound):
        memory_service.delete_fact(db, env, alex.web(), space.id, "Budget")


def test_adding_a_deleted_name_again_starts_a_new_fact(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.delete_fact(db, env, alex.web(), space.id, "Budget")

    change = memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$5,000")

    assert change.replaced_value is None
    rows = rows_of(db, space.id)
    assert rows[-1].action == "add"
    assert rows[-1].fact_id != rows[0].fact_id
    assert current_keys(db, space.id) == ["Dates", "Budget"]
    events = memory_service.fact_events(db, alex.id, space.id, "Budget")
    assert [(event.action, event.value) for event in events] == [("add", "$5,000")]


def test_the_history_lists_every_change_newest_first_with_earlier_values(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.via("ChatGPT"), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,500")
    memory_service.rename_fact(db, env, blake.web(), space.id, "Budget", "Total budget")
    memory_service.delete_fact(db, env, alex.web(), space.id, "Dates")

    events = memory_service.fact_events(db, alex.id, space.id, None)

    assert [
        (e.action, e.key, e.previous_key, e.value, e.previous_value, e.actor_name) for e in events
    ] == [
        ("delete", "Dates", None, "Dec 20", None, "Alex"),
        ("rename", "Total budget", "Budget", "$3,500", None, "Blake"),
        ("edit", "Budget", None, "$3,500", "$3,000", "Blake"),
        ("add", "Dates", None, "Dec 20", None, "Alex"),
        ("add", "Budget", None, "$3,000", None, "Alex"),
    ]
    assert (events[-1].via, events[-1].actor_id) == ("ChatGPT", alex.id)
    assert [event.at for event in events] == sorted((event.at for event in events), reverse=True)


def test_the_history_of_one_fact_follows_it_through_renames(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 21")
    memory_service.rename_fact(db, env, alex.web(), space.id, "Dates", "Trip dates")
    memory_service.set_fact(db, env, alex.web(), space.id, "Trip dates", "Dec 22")

    events = memory_service.fact_events(db, alex.id, space.id, "trip DATES")

    assert [(e.action, e.key, e.value, e.previous_value) for e in events] == [
        ("edit", "Trip dates", "Dec 22", "Dec 21"),
        ("rename", "Trip dates", "Dec 21", None),
        ("edit", "Dates", "Dec 21", "Dec 20"),
        ("add", "Dates", "Dec 20", None),
    ]
    with pytest.raises(FactNotFound):
        memory_service.fact_events(db, alex.id, space.id, "Dates")


def test_a_former_member_shows_as_nobody_in_the_history(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    for row in rows_of(db, space.id):
        row.set_by = None
    db.commit()

    events = memory_service.fact_events(db, alex.id, space.id, None)

    assert (events[0].actor_id, events[0].actor_name) == (None, None)


def test_renames_and_deletes_tell_the_space_page_to_refresh(
    db: Session, env: Env, alex: Person, space: SpaceView, monkeypatch: pytest.MonkeyPatch
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    seen: list[SpaceEvent] = []
    monkeypatch.setattr(env.events, "publish", seen.append)

    memory_service.rename_fact(db, env, alex.web(), space.id, "Budget", "Cost")
    memory_service.delete_fact(db, env, alex.web(), space.id, "Cost")

    assert seen == [SpaceEvent(MEMORY_SET, space.id), SpaceEvent(MEMORY_SET, space.id)]
