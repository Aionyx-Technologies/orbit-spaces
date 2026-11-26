from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.db import SessionFactory, session_scope
from orbit.errors import (
    Conflict,
    InvalidInput,
    NotAMember,
    RateLimited,
    TooLong,
    Unavailable,
)
from orbit.events import PLAN_ADDED
from orbit.limits import (
    COMBINE_CHAR_BUDGET,
    COMBINE_INSTRUCTION_MAX,
    COMBINE_MAX_ITEMS,
    COMBINE_MIN_ITEM_CHARS,
    COMBINES_PER_SPACE_PER_DAY,
    CONTENT_MAX,
)
from orbit.llm import CombineFailed
from orbit.models import Item, User, new_id
from orbit.services import combine as combine_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.combine_helpers import DEFAULT_PLAN, FakeCombiner
from tests.conftest import Factory, FakeClock, Person, RecordingSender

pytestmark = pytest.mark.anyio


@pytest.fixture
def llm(env: Env) -> FakeCombiner:
    fake = FakeCombiner()
    env.llm = fake
    return fake


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def space(make: Factory, alex: Person, blake: Person) -> SpaceView:
    return make.space(alex, "Goa trip", blake)


def seed(db: Session, env: Env, space: SpaceView, alex: Person, blake: Person) -> list[str]:
    memory_service.set_fact(db, env, alex.via("ChatGPT"), space.id, "Dates", "Dec 20 to 23")
    first = items_service.share_item(
        db, env, blake.via("Grok"), space.id, "Morning flight", "Leaves at 7:10"
    )
    second = items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Three options")
    return [first.id, second.id]


def test_combining_without_a_configured_model_says_so(
    db: Session, env: Env, alex: Person, space: SpaceView
) -> None:
    actor = alex.web()
    items_service.share_item(db, env, actor, space.id, "Note", "Body")

    with pytest.raises(Unavailable) as raised:
        combine_service.combine_space(db, env, actor, space.id, None)

    assert raised.value.message == "Combining is not set up on this server."


def test_only_members_can_combine(
    db: Session, env: Env, llm: FakeCombiner, make: Factory, space: SpaceView
) -> None:
    outsider = make.user("carol@example.com").web()

    with pytest.raises(NotAMember):
        combine_service.combine_space(db, env, outsider, space.id, None)

    assert llm.calls == []


def test_an_empty_space_has_nothing_to_combine(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, space: SpaceView
) -> None:
    actor = alex.web()

    with pytest.raises(InvalidInput) as raised:
        combine_service.combine_space(db, env, actor, space.id, None)

    assert raised.value.message == "There is nothing to combine yet. Share something first."
    assert llm.calls == []


def test_combining_saves_a_plan_written_by_orbit_from_everyones_input(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    item_ids = seed(db, env, space, alex, blake)

    result = combine_service.combine_space(db, env, alex.via("ChatGPT"), space.id, None)

    plan = result.item
    assert result.created is True
    assert plan.kind == "plan"
    assert plan.author_kind == "orbit"
    assert plan.shared_by_id is None
    assert plan.shared_by_name is None
    assert plan.title == "Combined plan"
    assert plan.content == DEFAULT_PLAN
    assert plan.via == "ChatGPT"
    assert plan.source_item_ids == item_ids
    assert items_service.latest_plan(db, space.id) is not None
    page = items_service.list_items(db, blake.id, space.id)
    assert page.items[0].id == plan.id


def test_the_model_sees_names_channels_dates_and_items_oldest_first(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)

    combine_service.combine_space(db, env, alex.web(), space.id, None)

    [call] = llm.calls
    assert [(f.key, f.value, f.set_by, f.via) for f in call.memory] == [
        ("Dates", "Dec 20 to 23", "Alex", "ChatGPT")
    ]
    assert [(i.title, i.shared_by, i.via) for i in call.items] == [
        ("Morning flight", "Blake", "Grok"),
        ("Hotels", "Alex", "web"),
    ]
    assert call.instruction is None
    assert call.omitted == 0


def test_retracted_items_and_earlier_plans_are_not_fed_back_in(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    ids = seed(db, env, space, alex, blake)
    combine_service.combine_space(db, env, alex.web(), space.id, None)
    items_service.retract_item(db, env, blake.web(), ids[0])
    items_service.share_item(db, env, alex.web(), space.id, "Fresh", "Newer")

    combine_service.combine_space(db, env, alex.web(), space.id, None)

    second = llm.calls[1]
    assert [item.title for item in second.items] == ["Hotels", "Fresh"]


def test_nothing_new_since_the_last_plan_returns_that_plan(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    first = combine_service.combine_space(db, env, alex.web(), space.id, None)

    again = combine_service.combine_space(db, env, blake.web(), space.id, None)

    assert again.created is False
    assert again.item.id == first.item.id
    assert len(llm.calls) == 1


def test_a_new_item_or_a_changed_fact_makes_the_next_combine_run(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    combine_service.combine_space(db, env, alex.web(), space.id, None)
    items_service.share_item(db, env, blake.web(), space.id, "More", "News")
    after_item = combine_service.combine_space(db, env, alex.web(), space.id, None)
    memory_service.set_fact(db, env, blake.web(), space.id, "Dates", "Dec 21 to 24")

    after_fact = combine_service.combine_space(db, env, alex.web(), space.id, None)

    assert after_item.created is True
    assert after_fact.created is True
    assert len(llm.calls) == 3


def test_an_instruction_always_runs_a_fresh_combine_and_is_cleaned(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    combine_service.combine_space(db, env, alex.web(), space.id, None)

    steered = combine_service.combine_space(
        db, env, alex.web(), space.id, "  focus on\nthe budget "
    )

    assert steered.created is True
    assert llm.calls[1].instruction == "focus on the budget"


def test_a_blank_instruction_is_the_same_as_none(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    combine_service.combine_space(db, env, alex.web(), space.id, None)

    again = combine_service.combine_space(db, env, alex.web(), space.id, "   ")

    assert again.created is False


def test_an_overlong_instruction_is_refused(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    actor = alex.web()
    too_long = "x" * (COMBINE_INSTRUCTION_MAX + 1)

    with pytest.raises(TooLong):
        combine_service.combine_space(db, env, actor, space.id, too_long)

    assert llm.calls == []


def test_a_space_can_combine_ten_times_a_day_then_waits(
    db: Session,
    env: Env,
    llm: FakeCombiner,
    clock: FakeClock,
    alex: Person,
    space: SpaceView,
) -> None:
    actor = alex.web()
    for number in range(COMBINES_PER_SPACE_PER_DAY):
        items_service.share_item(db, env, actor, space.id, f"Item {number}", "Body")
        assert combine_service.combine_space(db, env, actor, space.id, None).created is True
    items_service.share_item(db, env, actor, space.id, "One more", "Body")

    with pytest.raises(RateLimited) as raised:
        combine_service.combine_space(db, env, actor, space.id, None)

    assert "all 10 combines for today" in raised.value.message
    assert len(llm.calls) == COMBINES_PER_SPACE_PER_DAY
    clock.advance(hours=25)
    assert combine_service.combine_space(db, env, actor, space.id, None).created is True


def test_returning_the_existing_plan_does_not_use_up_the_allowance(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    combine_service.combine_space(db, env, alex.web(), space.id, None)

    for _ in range(COMBINES_PER_SPACE_PER_DAY + 3):
        assert combine_service.combine_space(db, env, alex.web(), space.id, None).created is False


def test_the_limit_is_per_space(
    db: Session, env: Env, llm: FakeCombiner, make: Factory, alex: Person
) -> None:
    busy = make.space(alex, "Busy")
    quiet = make.space(alex, "Quiet")
    actor = alex.web()
    for number in range(COMBINES_PER_SPACE_PER_DAY):
        items_service.share_item(db, env, actor, busy.id, f"Item {number}", "Body")
        combine_service.combine_space(db, env, actor, busy.id, None)
    items_service.share_item(db, env, actor, quiet.id, "Hello", "Body")

    assert combine_service.combine_space(db, env, actor, quiet.id, None).created is True


def test_a_failed_model_call_saves_nothing_and_can_be_retried(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    llm.error = CombineFailed("The AI service is busy right now. Try again in a minute.")
    actor = alex.web()

    with pytest.raises(Unavailable) as raised:
        combine_service.combine_space(db, env, actor, space.id, None)

    assert raised.value.message == "The AI service is busy right now. Try again in a minute."
    assert db.scalars(select(Item).where(Item.kind == "plan")).all() == []
    llm.error = None
    assert combine_service.combine_space(db, env, actor, space.id, None).created is True


def test_no_database_lock_is_held_while_the_model_thinks(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    llm: FakeCombiner,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    seed(db, env, space, alex, blake)
    wrote_during_the_call: list[bool] = []

    def write_from_somewhere_else() -> None:
        with session_scope(session_factory) as other:
            other.add(
                User(
                    id=new_id(), email="late@example.com", display_name="Late", created_at=env.now()
                )
            )
            other.commit()
        wrote_during_the_call.append(True)

    llm.on_call = write_from_somewhere_else

    combine_service.combine_space(db, env, alex.web(), space.id, None)

    assert wrote_during_the_call == [True]


def test_only_one_combine_runs_per_space_at_a_time(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    assert env.combines.try_acquire(space.id) is True
    actor = alex.web()

    with pytest.raises(Conflict) as raised:
        combine_service.combine_space(db, env, actor, space.id, None)

    assert "already combining" in raised.value.message
    assert llm.calls == []
    env.combines.release(space.id)
    assert combine_service.combine_space(db, env, actor, space.id, None).created is True


def test_the_in_flight_guard_is_released_after_success_and_failure(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    actor = alex.web()
    llm.error = CombineFailed("nope")
    with pytest.raises(Unavailable):
        combine_service.combine_space(db, env, actor, space.id, None)
    assert env.combines.try_acquire(space.id) is True
    env.combines.release(space.id)
    llm.error = None

    combine_service.combine_space(db, env, actor, space.id, None)

    assert env.combines.try_acquire(space.id) is True


def test_long_content_is_trimmed_to_the_newest_items_that_fit(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, space: SpaceView
) -> None:
    actor = alex.web()
    ids = [
        items_service.share_item(db, env, actor, space.id, f"Big {n}", "x" * CONTENT_MAX).id
        for n in range(5)
    ]
    fitting = COMBINE_CHAR_BUDGET // (CONTENT_MAX + len("Big 0"))

    result = combine_service.combine_space(db, env, actor, space.id, None)

    [call] = llm.calls
    assert [item.title for item in call.items] == [f"Big {n}" for n in range(5 - fitting, 5)]
    assert call.omitted == 5 - fitting
    assert result.item.source_item_ids == ids[5 - fitting :]
    assert sum(len(i.content) + len(i.title) for i in call.items) <= COMBINE_CHAR_BUDGET


def test_a_single_huge_item_is_shortened_not_dropped(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, space: SpaceView
) -> None:
    actor = alex.web()
    for number in range(20):
        memory_service.set_fact(db, env, actor, space.id, f"Fact {number}", "v" * 1_990)
    items_service.share_item(db, env, actor, space.id, "Huge", "h" * CONTENT_MAX)

    combine_service.combine_space(db, env, actor, space.id, None)

    [call] = llm.calls
    [only] = call.items
    assert only.title == "Huge"
    assert only.content.endswith("[Shortened to fit the length limit.]")
    assert COMBINE_MIN_ITEM_CHARS <= len(only.content) < CONTENT_MAX


def test_at_most_fifty_items_are_considered(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, space: SpaceView
) -> None:
    actor = alex.web()
    for number in range(COMBINE_MAX_ITEMS + 10):
        items_service.share_item(db, env, actor, space.id, f"Note {number:02d}", "short")

    combine_service.combine_space(db, env, actor, space.id, None)

    [call] = llm.calls
    assert len(call.items) == COMBINE_MAX_ITEMS
    assert call.items[0].title == "Note 10"
    assert call.items[-1].title == f"Note {COMBINE_MAX_ITEMS + 9}"
    assert call.omitted == 10


def test_the_saved_plan_is_cleaned_and_capped(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    llm.text = "Line one\x00\r\nLine two\x07 " + "z" * (CONTENT_MAX + 500)

    result = combine_service.combine_space(db, env, alex.web(), space.id, None)

    assert result.item.content.startswith("Line one\nLine two ")
    assert "\x00" not in result.item.content
    assert len(result.item.content) <= CONTENT_MAX


async def test_combining_announces_the_plan_without_its_text(
    db: Session, env: Env, llm: FakeCombiner, alex: Person, blake: Person, space: SpaceView
) -> None:
    seed(db, env, space, alex, blake)
    subscription = env.events.subscribe(space.id)

    result = await asyncio.to_thread(
        combine_service.combine_space, db, env, alex.via("ChatGPT"), space.id, None
    )

    event = await asyncio.wait_for(subscription.queue.get(), 2)
    assert event.type == PLAN_ADDED
    assert event.data == {"item_id": result.item.id}


def test_the_other_members_are_emailed_about_a_new_plan_but_not_the_requester(
    db: Session,
    env: Env,
    session_factory: SessionFactory,
    llm: FakeCombiner,
    alex: Person,
    blake: Person,
    space: SpaceView,
) -> None:
    recorder = RecordingSender()
    env.mailer.sender = recorder
    seed(db, env, space, alex, blake)
    env.notifier.flush_due(session_factory, force=True)
    env.mailer.drain()
    recorder.messages.clear()

    combine_service.combine_space(db, env, alex.via("ChatGPT"), space.id, None)
    env.notifier.flush_due(session_factory, force=True)
    env.mailer.drain()

    [message] = recorder.messages
    assert message.to == blake.email
    assert message.subject == "1 update in Goa trip"
    assert "Orbit combined a new plan, requested by Alex via ChatGPT" in message.text
    assert "Stay at Hotel 2" not in message.text
