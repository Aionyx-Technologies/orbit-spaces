from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from orbit.errors import (
    Forbidden,
    InvalidInput,
    ItemNotFound,
    NotAMember,
    SpaceNotFound,
    TooLong,
)
from orbit.limits import CONTENT_MAX, MAX_PAGE_SIZE, TITLE_MAX
from orbit.models import Item, new_id
from orbit.services import items as items_service
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


def test_share_from_the_web_is_authored_by_a_person(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, alex.web(), space.id, "Flight", "Leaves at 7:10")

    assert item.kind == "note"
    assert item.author_kind == "person"
    assert item.via == "web"
    assert item.shared_by_id == alex.id
    assert item.shared_by_name == "Alex"
    assert item.title == "Flight"
    assert item.source_item_ids is None


def test_share_from_an_assistant_records_the_client_name(
    db: Session, env: Env, blake: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, blake.via("Grok"), space.id, "Hotels", "Three options")

    assert item.author_kind == "assistant"
    assert item.via == "Grok"
    assert item.shared_by_name == "Blake"


def test_sharing_requires_membership(
    db: Session, env: Env, make: Factory, space: SpaceView
) -> None:
    outsider = make.user("carol@example.com").web()

    with pytest.raises(NotAMember):
        items_service.share_item(db, env, outsider, space.id, "Sneaky", "Not allowed")


def test_sharing_to_a_missing_space_fails(db: Session, env: Env, alex: Person) -> None:
    actor = alex.web()
    missing = new_id()

    with pytest.raises(SpaceNotFound):
        items_service.share_item(db, env, actor, missing, "Title", "Body")


@pytest.mark.parametrize(
    ("title", "content", "error"),
    [
        ("", "Body", InvalidInput),
        ("   ", "Body", InvalidInput),
        ("Title", "", InvalidInput),
        ("Title", "  \n ", InvalidInput),
        ("t" * (TITLE_MAX + 1), "Body", TooLong),
        ("Title", "c" * (CONTENT_MAX + 1), TooLong),
    ],
)
def test_sharing_validates_title_and_content(
    db: Session,
    env: Env,
    alex: Person,
    space: SpaceView,
    title: str,
    content: str,
    error: type[Exception],
) -> None:
    actor = alex.web()

    with pytest.raises(error):
        items_service.share_item(db, env, actor, space.id, title, content)


def test_sharing_accepts_the_exact_limits(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(
        db, env, alex.web(), space.id, "t" * TITLE_MAX, "c" * CONTENT_MAX
    )

    assert len(item.title) == TITLE_MAX
    assert len(item.content) == CONTENT_MAX


def test_sharing_cleans_titles_and_strips_control_characters(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(
        db, env, alex.web(), space.id, "Line one\nline   two\x00", "Keep\nnewlines\x07 here"
    )

    assert item.title == "Line one line two"
    assert item.content == "Keep\nnewlines here"


def test_feed_is_newest_first_and_pages_with_before(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    ids = [
        items_service.share_item(db, env, alex.web(), space.id, f"Item {n}", f"Body {n}").id
        for n in range(5)
    ]

    first = items_service.list_items(db, blake.id, space.id, limit=2)
    second = items_service.list_items(db, blake.id, space.id, before=first.next_before, limit=2)
    third = items_service.list_items(db, blake.id, space.id, before=second.next_before, limit=2)

    assert [item.id for item in first.items] == [ids[4], ids[3]]
    assert [item.id for item in second.items] == [ids[2], ids[1]]
    assert [item.id for item in third.items] == [ids[0]]
    assert first.next_before == ids[3]
    assert third.next_before is None


def test_feed_limit_is_clamped(db: Session, env: Env, alex: Person, space: SpaceView) -> None:
    for n in range(MAX_PAGE_SIZE + 3):
        items_service.share_item(db, env, alex.web(), space.id, f"Item {n}", "Body")

    page = items_service.list_items(db, alex.id, space.id, limit=10_000)
    tiny = items_service.list_items(db, alex.id, space.id, limit=0)

    assert len(page.items) == MAX_PAGE_SIZE
    assert page.next_before is not None
    assert len(tiny.items) == 1


def test_reading_requires_membership(db: Session, make: Factory, space: SpaceView) -> None:
    outsider = make.user("carol@example.com")

    with pytest.raises(NotAMember):
        items_service.list_items(db, outsider.id, space.id)


def test_a_page_marker_from_another_space_is_rejected(
    db: Session, env: Env, make: Factory, alex: Person, space: SpaceView
) -> None:
    other = make.space(alex, "Other")
    foreign = items_service.share_item(db, env, alex.web(), other.id, "Elsewhere", "Body")

    with pytest.raises(InvalidInput):
        items_service.list_items(db, alex.id, space.id, before=foreign.id)


def test_an_unknown_page_marker_is_rejected(db: Session, alex: Person, space: SpaceView) -> None:
    marker = new_id()

    with pytest.raises(InvalidInput):
        items_service.list_items(db, alex.id, space.id, before=marker)


def test_only_the_sharer_can_retract(
    db: Session, env: Env, alex: Person, blake: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, alex.web(), space.id, "Mine", "Secret plan")
    other = blake.web()

    with pytest.raises(Forbidden):
        items_service.retract_item(db, env, other, item.id)

    retracted = items_service.retract_item(db, env, alex.web(), item.id)
    assert retracted.id == item.id


def test_retracting_scrubs_the_content_and_hides_the_item(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, alex.web(), space.id, "Oops", "Wrong thing shared")

    items_service.retract_item(db, env, alex.web(), item.id)

    row = db.get(Item, item.id)
    assert row is not None
    assert row.retracted_at is not None
    assert row.title == ""
    assert row.content == ""
    assert items_service.list_items(db, alex.id, space.id).items == []


def test_retracting_twice_reports_not_found(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, alex.web(), space.id, "Once", "Body")
    actor = alex.web()
    items_service.retract_item(db, env, actor, item.id)

    with pytest.raises(ItemNotFound):
        items_service.retract_item(db, env, actor, item.id)


def test_outsiders_cannot_learn_that_an_item_exists(
    db: Session, env: Env, make: Factory, alex: Person, space: SpaceView
) -> None:
    item = items_service.share_item(db, env, alex.web(), space.id, "Private", "Body")
    outsider = make.user("carol@example.com").web()

    with pytest.raises(ItemNotFound):
        items_service.retract_item(db, env, outsider, item.id)


def test_plans_cannot_be_retracted_by_anyone(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    plan = Item(
        id=new_id(),
        space_id=space.id,
        kind="plan",
        title="Combined plan",
        content="Stay at Hotel 2",
        author_kind="orbit",
        shared_by=None,
        via="web",
        source_item_ids=[],
        created_at=env.now(),
    )
    db.add(plan)
    db.commit()
    actor = alex.web()

    with pytest.raises(Forbidden):
        items_service.retract_item(db, env, actor, plan.id)


def test_latest_plan_and_recent_notes_are_separate(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    note = items_service.share_item(db, env, alex.web(), space.id, "Note", "Body")
    plan = Item(
        id=new_id(),
        space_id=space.id,
        kind="plan",
        title="Plan",
        content="Do the thing",
        author_kind="orbit",
        shared_by=None,
        via="web",
        source_item_ids=[note.id],
        created_at=env.now(),
    )
    db.add(plan)
    db.commit()

    latest = items_service.latest_plan(db, space.id)
    notes = items_service.recent_notes(db, space.id, 20)

    assert latest is not None
    assert latest.id == plan.id
    assert latest.author_kind == "orbit"
    assert latest.shared_by_name is None
    assert latest.source_item_ids == [note.id]
    assert [item.id for item in notes] == [note.id]
