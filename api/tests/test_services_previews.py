from __future__ import annotations

import uuid
from dataclasses import fields
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session

from orbit.limits import CARD_HIGHLIGHT_VALUE_CHARS, CARD_HIGHLIGHTS, CARD_SOURCES
from orbit.models import Item, Memory, Space, SpaceMember, User, new_id
from orbit.services import memory as memory_service
from orbit.services import previews as previews_service
from orbit.services import spaces as spaces_service
from orbit.services.context import VIA_ORBIT_SUGGESTION, Env
from orbit.services.views import Highlight, LatestItem, SpacePreview, SpaceView
from tests.conftest import Factory, Person
from tests.sql_helpers import counted_statements

START = datetime(2026, 1, 15, 12, 0, tzinfo=UTC)
ELLIPSIS = "\N{HORIZONTAL ELLIPSIS}"


def at(minutes: int) -> datetime:
    return START + timedelta(minutes=minutes)


def add_space(
    db: Session, owner: Person, name: str, created_at: datetime, *members: Person
) -> SpaceView:
    space = Space(id=new_id(), name=name, created_by=owner.id, created_at=created_at)
    db.add(space)
    db.flush()
    for member in (owner, *members):
        db.add(
            SpaceMember(
                space_id=space.id, user_id=member.id, joined_at=created_at, notify_email=True
            )
        )
    db.commit()
    return spaces_service.get_space_view(db, owner.id, space.id)


def add_item(
    db: Session,
    space_id: str,
    created_at: datetime,
    *,
    title: str = "A note",
    kind: str = "note",
    via: str = "web",
    author_kind: str = "person",
    shared_by: Person | None = None,
    retracted: bool = False,
    item_id: str | None = None,
) -> Item:
    item = Item(
        id=item_id or new_id(),
        space_id=space_id,
        kind=kind,
        title="" if retracted else title,
        content="" if retracted else "SECRET BODY",
        author_kind=author_kind,
        shared_by=shared_by.id if shared_by else None,
        via=via,
        source_item_ids=None,
        created_at=created_at,
        retracted_at=created_at if retracted else None,
    )
    db.add(item)
    db.commit()
    return item


def add_fact(
    db: Session,
    space_id: str,
    created_at: datetime,
    key: str,
    value: str,
    *,
    via: str = "web",
    set_by: Person | None = None,
    superseded_at: datetime | None = None,
) -> Memory:
    fact = Memory(
        id=new_id(),
        space_id=space_id,
        # One fact per name, as when every version was saved under the same name.
        fact_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{space_id}/{key.casefold()}")),
        action="add",
        key=key,
        value=value,
        set_by=set_by.id if set_by else None,
        via=via,
        created_at=created_at,
        superseded_at=superseded_at,
    )
    db.add(fact)
    db.commit()
    return fact


def preview_of(db: Session, viewer: Person, space: SpaceView) -> SpacePreview:
    views = spaces_service.list_spaces(db, viewer.id)
    return previews_service.preview_spaces(db, views)[space.id]


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


def test_a_space_with_nothing_shared_has_an_empty_card(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Empty", at(0))

    assert preview_of(db, alex, space) == SpacePreview(
        owner_name="Alex",
        last_activity_at=at(0),
        note_count=0,
        fact_count=0,
        has_plan=False,
        highlights=[],
        latest=None,
        sources=[],
    )


def test_a_rich_space_is_summarised_field_by_field(
    db: Session, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)
    add_item(db, space.id, at(10), title="Flights", via="ChatGPT", author_kind="assistant")
    add_item(db, space.id, at(20), title="Packing", shared_by=blake)
    add_item(db, space.id, at(30), title="Hotels", via="Claude", author_kind="assistant")
    add_item(db, space.id, at(35), title="Plan", kind="plan", via="orbit", author_kind="orbit")
    add_item(db, space.id, at(40), via="Grok", author_kind="assistant", retracted=True)
    add_fact(db, space.id, at(5), "Dates", "Dec 19", via="ChatGPT", superseded_at=at(25))
    add_fact(db, space.id, at(25), "Dates", "Dec 20 to 23", via="Claude")
    add_fact(db, space.id, at(15), "Budget", "$3,000", set_by=blake)
    add_fact(db, space.id, at(31), "Hotel", "Seaside Inn", via="Gemini")

    assert preview_of(db, alex, space) == SpacePreview(
        owner_name="Alex",
        last_activity_at=at(35),
        note_count=3,
        fact_count=3,
        has_plan=True,
        highlights=[
            Highlight("Dates", "Dec 20 to 23"),
            Highlight("Budget", "$3,000"),
            Highlight("Hotel", "Seaside Inn"),
        ],
        latest=LatestItem("Plan", "plan", "orbit", "orbit", None, at(35)),
        sources=["Gemini", "Claude", "ChatGPT"],
    )


def test_the_preview_of_a_space_never_carries_item_content(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), title="Visible title", shared_by=alex)

    preview = preview_of(db, alex, space)

    assert preview.latest is not None
    assert preview.latest.title == "Visible title"
    assert {field.name for field in fields(LatestItem)} == {
        "title",
        "kind",
        "via",
        "author_kind",
        "shared_by_name",
        "created_at",
    }
    assert "SECRET BODY" not in repr(preview)


def test_plans_and_retracted_notes_are_not_counted_as_notes(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(1))
    add_item(db, space.id, at(2))
    add_item(db, space.id, at(3), retracted=True)
    add_item(db, space.id, at(4), kind="plan", via="orbit", author_kind="orbit")

    assert preview_of(db, alex, space).note_count == 2


def test_a_plan_has_to_be_live_to_count(db: Session, alex: Person) -> None:
    only_notes = add_space(db, alex, "Only notes", at(0))
    retracted_plan = add_space(db, alex, "Retracted plan", at(0))
    live_plan = add_space(db, alex, "Live plan", at(0))
    add_item(db, only_notes.id, at(1))
    add_item(db, retracted_plan.id, at(1), kind="plan", author_kind="orbit", retracted=True)
    add_item(db, live_plan.id, at(1), kind="plan", via="orbit", author_kind="orbit")

    previews = previews_service.preview_spaces(db, spaces_service.list_spaces(db, alex.id))

    assert previews[only_notes.id].has_plan is False
    assert previews[retracted_plan.id].has_plan is False
    assert previews[live_plan.id].has_plan is True


def test_a_rewritten_fact_counts_once_and_superseded_rows_do_not_count(
    db: Session, env: Env, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)
    for key, value in [("Budget", "$3,000"), ("budget", "$3,500"), ("BUDGET", "$4,000")]:
        memory_service.set_fact(db, env, alex.web(), space.id, key, value)
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 20")

    preview = preview_of(db, alex, space)

    assert preview.fact_count == 2
    assert preview.highlights == [Highlight("Budget", "$4,000"), Highlight("Dates", "Dec 20")]


def test_the_latest_item_is_the_newest_live_one_and_names_who_shared_it(
    db: Session, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)
    add_item(db, space.id, at(10), title="Older", shared_by=alex)
    add_item(
        db, space.id, at(20), title="Newest", via="Claude", author_kind="assistant", shared_by=blake
    )
    add_item(db, space.id, at(30), title="Retracted", shared_by=alex, retracted=True)

    latest = preview_of(db, alex, space).latest

    assert latest == LatestItem("Newest", "note", "Claude", "assistant", "Blake", at(20))


def test_the_latest_item_has_no_person_when_the_sharer_account_is_gone(
    db: Session, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)
    add_item(db, space.id, at(10), title="Orphaned", shared_by=blake)
    db.execute(delete(User).where(User.id == blake.id))
    db.commit()

    latest = preview_of(db, alex, space).latest

    assert latest is not None
    assert (latest.title, latest.shared_by_name) == ("Orphaned", None)


def test_an_item_written_by_orbit_never_names_a_person(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(
        db,
        space.id,
        at(10),
        title="Plan",
        kind="plan",
        via="orbit",
        author_kind="orbit",
        shared_by=alex,
    )

    latest = preview_of(db, alex, space).latest

    assert latest is not None
    assert (latest.kind, latest.author_kind, latest.shared_by_name) == ("plan", "orbit", None)


def test_items_with_the_same_time_resolve_to_the_larger_id_like_the_feed_does(
    db: Session, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), title="Lower id", item_id="00000000-0000-0000-0000-000000000001")
    add_item(
        db, space.id, at(10), title="Higher id", item_id="00000000-0000-0000-0000-000000000002"
    )

    latest = preview_of(db, alex, space).latest

    assert latest is not None
    assert latest.title == "Higher id"


def test_highlights_are_the_first_three_facts_in_the_order_of_the_space_page(
    db: Session, env: Env, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    for key in ["Dates", "Budget", "Hotel", "Flights", "Visa"]:
        memory_service.set_fact(db, env, alex.web(), space.id, key, f"{key} value")
    memory_service.set_fact(db, env, alex.web(), space.id, "dates", "Dec 21")

    preview = preview_of(db, alex, space)

    page_order = [fact.key for fact in memory_service.current_facts(db, space.id)]
    assert [highlight.key for highlight in preview.highlights] == page_order[:CARD_HIGHLIGHTS]
    assert page_order == ["Dates", "Budget", "Hotel", "Flights", "Visa"]
    assert preview.highlights[0] == Highlight("Dates", "Dec 21")
    assert preview.fact_count == 5


def test_highlights_keep_the_first_set_order_not_alphabetical_or_last_edited_order(
    db: Session, env: Env, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    memory_service.set_fact(db, env, alex.web(), space.id, "Zebra", "1")
    memory_service.set_fact(db, env, alex.web(), space.id, "Apple", "1")
    memory_service.set_fact(db, env, alex.web(), space.id, "Zebra", "2")

    preview = preview_of(db, alex, space)

    assert [highlight.key for highlight in preview.highlights] == ["Zebra", "Apple"]


@pytest.mark.parametrize(
    ("raw", "shown"),
    [
        ("short", "short"),
        ("  padded  ", "padded"),
        ("line one\n\nline  two\tend", "line one line two end"),
        ("x" * CARD_HIGHLIGHT_VALUE_CHARS, "x" * 72),
        ("x" * (CARD_HIGHLIGHT_VALUE_CHARS + 1), "x" * 72 + ELLIPSIS),
        ("x" * 500, "x" * 72 + ELLIPSIS),
        ("word " * 40, "word " * 14 + "wo" + ELLIPSIS),
        ("a" * 71 + "   " + "b" * 20, "a" * 71 + ELLIPSIS),
        ("a" * 30 + " " * 50 + "b" * 30, "a" * 30 + " " + "b" * 30),
    ],
)
def test_highlight_values_are_one_line_and_cut_at_72_characters(
    db: Session, alex: Person, raw: str, shown: str
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_fact(db, space.id, at(1), "Note", raw)

    [highlight] = preview_of(db, alex, space).highlights

    assert highlight.value == shown


def test_at_most_three_highlights_are_offered_but_every_current_fact_is_counted(
    db: Session, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    for index in range(5):
        add_fact(db, space.id, at(index + 1), f"Key {index}", f"Value {index}")

    preview = preview_of(db, alex, space)

    assert [highlight.key for highlight in preview.highlights] == ["Key 0", "Key 1", "Key 2"]
    assert len(preview.highlights) == CARD_HIGHLIGHTS == 3
    assert preview.fact_count == 5


def test_sources_are_the_assistants_behind_current_content_most_recent_first(
    db: Session, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), via="ChatGPT", author_kind="assistant")
    add_item(db, space.id, at(20), via="Claude", author_kind="assistant")
    add_item(db, space.id, at(30), via="ChatGPT", author_kind="assistant")
    add_fact(db, space.id, at(40), "Dates", "Dec 20", via="Grok")

    assert preview_of(db, alex, space).sources == ["Grok", "ChatGPT", "Claude"]


def test_sources_leave_out_web_and_orbit(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), via="web")
    add_item(db, space.id, at(20), kind="plan", via="orbit", author_kind="orbit")
    add_fact(db, space.id, at(30), "Dates", "Dec 20", via="web")
    add_item(db, space.id, at(5), via="Claude", author_kind="assistant")

    assert preview_of(db, alex, space).sources == ["Claude"]


def test_sources_skip_orbit_suggestion(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_fact(db, space.id, at(10), "Dates", "Dec 20", via=VIA_ORBIT_SUGGESTION)

    assert preview_of(db, alex, space).sources == []


def test_sources_ignore_retracted_items_and_superseded_facts(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), via="Retracted", author_kind="assistant", retracted=True)
    add_fact(db, space.id, at(20), "Dates", "Dec 19", via="Superseded", superseded_at=at(30))
    add_fact(db, space.id, at(30), "Dates", "Dec 20", via="Kept")

    assert preview_of(db, alex, space).sources == ["Kept"]


def test_a_source_is_ranked_by_its_newest_item_or_fact(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10), via="Claude", author_kind="assistant")
    add_item(db, space.id, at(20), via="ChatGPT", author_kind="assistant")
    add_fact(db, space.id, at(30), "Dates", "Dec 20", via="Claude")

    assert preview_of(db, alex, space).sources == ["Claude", "ChatGPT"]


def test_sources_with_the_same_time_are_ordered_by_name(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    for name in ["Grok", "Claude", "ChatGPT"]:
        add_item(db, space.id, at(10), via=name, author_kind="assistant")

    assert preview_of(db, alex, space).sources == ["ChatGPT", "Claude", "Grok"]


def test_at_most_four_sources_are_listed_keeping_the_most_recent(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    for index, name in enumerate(["Oldest", "Second", "Third", "Fourth", "Fifth"]):
        add_item(db, space.id, at(10 + index), via=name, author_kind="assistant")

    sources = preview_of(db, alex, space).sources

    assert sources == ["Fifth", "Fourth", "Third", "Second"]
    assert len(sources) == CARD_SOURCES == 4


def test_activity_starts_at_creation_even_when_older_content_was_imported(
    db: Session, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(100))
    add_item(db, space.id, at(10))
    add_fact(db, space.id, at(20), "Dates", "Dec 20")

    assert preview_of(db, alex, space).last_activity_at == at(100)


def test_a_newer_item_moves_activity_forward(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10))
    add_item(db, space.id, at(50), kind="plan", via="orbit", author_kind="orbit")
    add_fact(db, space.id, at(30), "Dates", "Dec 20")

    assert preview_of(db, alex, space).last_activity_at == at(50)


def test_a_newer_fact_moves_activity_forward(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10))
    add_fact(db, space.id, at(30), "Dates", "Dec 20")

    assert preview_of(db, alex, space).last_activity_at == at(30)


def test_activity_looks_at_every_fact_row_including_superseded_ones(
    db: Session, alex: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_fact(db, space.id, at(10), "Dates", "Dec 20")
    add_fact(db, space.id, at(40), "Budget", "$3,000", superseded_at=at(41))

    assert preview_of(db, alex, space).last_activity_at == at(40)


def test_retracting_an_item_is_not_activity(db: Session, alex: Person) -> None:
    space = add_space(db, alex, "Goa trip", at(0))
    add_item(db, space.id, at(10))
    add_item(db, space.id, at(90), retracted=True)

    assert preview_of(db, alex, space).last_activity_at == at(10)


def test_the_owner_is_the_creators_display_name_not_the_viewers(
    db: Session, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)

    assert preview_of(db, blake, space).owner_name == "Alex"
    assert preview_of(db, alex, space).owner_name == "Alex"


def test_the_owner_is_unknown_when_the_creator_account_is_gone(
    db: Session, alex: Person, blake: Person
) -> None:
    space = add_space(db, alex, "Goa trip", at(0), blake)
    db.execute(delete(User).where(User.id == alex.id))
    db.commit()

    assert preview_of(db, blake, space).owner_name is None


def test_each_space_gets_only_its_own_numbers(db: Session, alex: Person, blake: Person) -> None:
    first = add_space(db, alex, "First", at(0))
    second = add_space(db, alex, "Second", at(1), blake)
    elsewhere = add_space(db, blake, "Elsewhere", at(2))
    add_item(db, first.id, at(10), title="First note", via="ChatGPT", author_kind="assistant")
    add_item(
        db, first.id, at(11), title="First plan", kind="plan", via="orbit", author_kind="orbit"
    )
    add_fact(db, first.id, at(12), "Dates", "First dates", via="ChatGPT")
    add_item(db, second.id, at(20), title="Second note", shared_by=blake)
    add_item(db, second.id, at(21), title="Another note", via="Claude", author_kind="assistant")
    add_fact(db, second.id, at(22), "Budget", "Second budget", via="Claude")
    add_fact(db, second.id, at(23), "Hotel", "Second hotel", via="Claude")
    add_item(db, elsewhere.id, at(30), title="Not yours", via="Grok", author_kind="assistant")

    previews = previews_service.preview_spaces(db, spaces_service.list_spaces(db, alex.id))

    assert set(previews) == {first.id, second.id}
    one, two = previews[first.id], previews[second.id]
    assert (one.note_count, one.fact_count, one.has_plan) == (1, 1, True)
    assert (two.note_count, two.fact_count, two.has_plan) == (2, 2, False)
    assert one.latest == LatestItem("First plan", "plan", "orbit", "orbit", None, at(11))
    assert two.latest == LatestItem("Another note", "note", "Claude", "assistant", None, at(21))
    assert one.sources == ["ChatGPT"]
    assert two.sources == ["Claude"]
    assert [highlight.key for highlight in one.highlights] == ["Dates"]
    assert [highlight.key for highlight in two.highlights] == ["Budget", "Hotel"]
    assert (one.last_activity_at, two.last_activity_at) == (at(12), at(23))


def test_no_spaces_means_no_previews_and_no_queries(db: Session, engine: Engine) -> None:
    with counted_statements(engine) as statements:
        previews = previews_service.preview_spaces(db, [])

    assert previews == {}
    assert statements == []


def fill_with_spaces(
    db: Session, owner: Person, other: Person, count: int, first_minute: int
) -> None:
    for index in range(count):
        minute = first_minute + index * 10
        space = add_space(db, owner, f"Space {minute}", at(minute), other)
        add_item(db, space.id, at(minute + 1), via="ChatGPT", author_kind="assistant")
        add_item(db, space.id, at(minute + 2), shared_by=other)
        add_fact(db, space.id, at(minute + 3), "Dates", f"Day {index}", via="Claude")
        if index % 2:
            add_item(db, space.id, at(minute + 4), kind="plan", via="orbit", author_kind="orbit")


def preview_statements(db: Session, engine: Engine, viewer: Person) -> list[str]:
    views = spaces_service.list_spaces(db, viewer.id)
    with counted_statements(engine) as statements:
        previews_service.preview_spaces(db, views)
    return statements


def test_the_number_of_queries_does_not_grow_with_the_number_of_spaces(
    db: Session, engine: Engine, make: Factory, alex: Person, blake: Person
) -> None:
    carol = make.user("carol@example.com", "Carol")
    fill_with_spaces(db, alex, blake, 1, 0)
    fill_with_spaces(db, carol, blake, 12, 1_000)

    few = preview_statements(db, engine, alex)
    many = preview_statements(db, engine, carol)

    assert len(many) == len(few) > 0
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in many)
