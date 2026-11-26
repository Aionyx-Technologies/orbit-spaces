from __future__ import annotations

import asyncio
import json
import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit import space_templates
from orbit.errors import InvalidInput, NotAMember, RateLimited, SpaceNotFound, TooLong, Unavailable
from orbit.events import TEMPLATE_CHANGED
from orbit.limits import MEMORY_VALUE_MAX, TEMPLATE_DRAFTS_PER_USER_PER_DAY, TEMPLATE_PURPOSE_MAX
from orbit.llm import CombineFailed
from orbit.models import Item, Memory, Space
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import overview as overview_service
from orbit.services import spaces as spaces_service
from orbit.services import templates as templates_service
from orbit.services.context import Env
from orbit.space_templates import (
    TEMPLATE_DIR,
    InvalidTemplate,
    builtin_template,
    builtin_templates,
    general_template,
    template_to_dict,
)
from tests.conftest import Factory, FakeClock, Person
from tests.template_helpers import DRAFTED, FakeDrafter, drafted_reply, suggested_reply

pytestmark = pytest.mark.anyio

DRAFTS_PER_DAY = TEMPLATE_DRAFTS_PER_USER_PER_DAY[0]
MISSING_SPACE = "00000000-0000-0000-0000-000000000000"


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def drafter(env: Env) -> FakeDrafter:
    fake = FakeDrafter()
    env.drafter = fake
    return fake


@pytest.fixture
def edited_built_ins(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    folder = tmp_path / "spaces"
    shutil.copytree(TEMPLATE_DIR, folder)
    monkeypatch.setattr(space_templates, "TEMPLATE_DIR", folder)
    builtin_templates.cache_clear()
    yield folder
    monkeypatch.undo()
    builtin_templates.cache_clear()


def edit_body(**changes: Any) -> dict[str, Any]:
    return {**template_to_dict(builtin_template("trip")), **changes}


@pytest.mark.parametrize("template_id", list(builtin_templates()))
def test_a_space_can_start_from_each_built_in_template(
    db: Session, env: Env, alex: Person, template_id: str
) -> None:
    template = builtin_template(template_id)

    space = spaces_service.create_space(db, env, alex.web(), "Trip", template)

    assert space.template == template
    row = db.get(Space, space.id)
    assert row is not None
    assert row.template_id == template_id
    assert row.template == template_to_dict(template)


def test_a_space_without_a_template_gets_general(db: Session, env: Env, alex: Person) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip")

    assert space.template == general_template()
    row = db.get(Space, space.id)
    assert row is not None
    assert row.template_id == "general"


def test_a_space_can_start_from_a_custom_template(db: Session, env: Env, alex: Person) -> None:
    custom = templates_service.choose_template(None, DRAFTED)

    space = spaces_service.create_space(db, env, alex.web(), "Garden", custom)

    row = db.get(Space, space.id)
    assert row is not None
    assert row.template_id == "custom"
    assert space.template.name == "Garden club"
    assert space.template.plan_sections == ("This month", "Shopping list", "To settle")


def test_choosing_a_template_takes_an_id_or_a_full_template_but_not_both() -> None:
    assert templates_service.choose_template("team-project", None).id == "team-project"
    assert templates_service.choose_template(None, None) is general_template()
    with pytest.raises(InvalidInput) as both:
        templates_service.choose_template("team-project", DRAFTED)
    with pytest.raises(InvalidTemplate):
        templates_service.choose_template("nope", None)
    with pytest.raises(InvalidInput):
        templates_service.choose_template(None, {"name": ""})

    assert both.value.message == "Send either template_id or template, not both."


def test_each_space_holds_its_own_copy_so_editing_a_built_in_changes_no_existing_space(
    db: Session, env: Env, alex: Person, edited_built_ins: Path
) -> None:
    before = spaces_service.create_space(db, env, alex.web(), "Old", builtin_template("trip"))
    path = edited_built_ins / "trip.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace('"Trip"', '"Changed vacation"'),
        encoding="utf-8",
    )
    builtin_templates.cache_clear()

    after = spaces_service.create_space(db, env, alex.web(), "New", builtin_template("trip"))

    assert spaces_service.get_space_view(db, alex.id, before.id).template.name == "Trip"
    assert after.template.name == "Changed vacation"


def test_a_member_edit_changes_only_that_spaces_copy(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    first = make.space(alex, "First", blake)
    second = make.space(alex, "Second")

    templates_service.set_space_template(
        db, env, blake.web(), first.id, edit_body(name="Edited", plan_sections=["Only this"])
    )

    edited = spaces_service.get_space_view(db, alex.id, first.id).template
    untouched = spaces_service.get_space_view(db, alex.id, second.id).template
    assert edited.name == "Edited"
    assert edited.plan_sections == ("Only this", "To settle")
    assert untouched == general_template()
    assert builtin_template("trip").name == "Trip"


def test_an_edit_keeps_where_the_template_came_from_and_ignores_a_supplied_id(
    db: Session, env: Env, alex: Person
) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip", builtin_template("trip"))

    saved = templates_service.set_space_template(
        db, env, alex.web(), space.id, edit_body(id="somebody-else")
    )

    row = db.get(Space, space.id)
    assert row is not None
    assert row.template_id == "trip"
    assert saved.id == "trip"
    assert row.template["id"] == "trip"


def test_an_edit_always_ends_the_plan_with_to_settle(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    space = make.space(alex)

    saved = templates_service.set_space_template(
        db, env, alex.web(), space.id, edit_body(plan_sections=["To settle", "First", "Second"])
    )

    assert saved.plan_sections == ("First", "Second", "To settle")


def test_only_members_can_read_or_edit_a_spaces_template(
    db: Session, env: Env, alex: Person, blake: Person, make: Factory
) -> None:
    space = make.space(alex)

    outsider = blake.web()
    member = alex.web()
    body = edit_body()
    with pytest.raises(NotAMember):
        templates_service.set_space_template(db, env, outsider, space.id, body)
    with pytest.raises(NotAMember):
        templates_service.get_space_template(db, blake.id, space.id)
    with pytest.raises(SpaceNotFound):
        templates_service.set_space_template(db, env, member, MISSING_SPACE, body)

    assert templates_service.get_space_template(db, alex.id, space.id) == general_template()


def test_an_invalid_edit_is_refused_and_leaves_the_template_as_it_was(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    space = make.space(alex)

    actor = alex.web()
    too_long = edit_body(name="n" * 41)
    duplicate_facts = edit_body(facts=[{"key": "A"}, {"key": "a"}])
    with pytest.raises(TooLong):
        templates_service.set_space_template(db, env, actor, space.id, too_long)
    with pytest.raises(InvalidTemplate):
        templates_service.set_space_template(db, env, actor, space.id, duplicate_facts)

    assert templates_service.get_space_template(db, alex.id, space.id) == general_template()


def test_editing_the_template_does_not_touch_memory_items_or_plans(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    space = make.space(alex)
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Three options")
    facts_before = db.scalar(select(func.count()).select_from(Memory))
    items_before = db.scalar(select(func.count()).select_from(Item))

    templates_service.set_space_template(
        db, env, alex.web(), space.id, edit_body(facts=[], plan_sections=["Other"])
    )

    assert db.scalar(select(func.count()).select_from(Memory)) == facts_before
    assert db.scalar(select(func.count()).select_from(Item)) == items_before
    detail = overview_service.get_space_detail(db, alex.id, space.id)
    assert [fact.key for fact in detail.facts] == ["Dates"]


async def test_editing_a_template_tells_everyone_watching_the_space(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    space = make.space(alex)
    subscription = env.events.subscribe(space.id)

    await asyncio.to_thread(
        templates_service.set_space_template, db, env, alex.web(), space.id, edit_body()
    )

    event = await asyncio.wait_for(subscription.queue.get(), 2)
    assert event.type == TEMPLATE_CHANGED
    assert event.space_id == space.id


def test_unset_facts_shrink_as_facts_are_set_and_ignore_case(
    db: Session, env: Env, alex: Person
) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip", builtin_template("trip"))

    def unset() -> list[str]:
        detail = overview_service.get_space_detail(db, alex.id, space.id)
        return [fact.key for fact in detail.unset_facts]

    assert unset() == ["Dates", "Destination", "Headcount", "Budget"]
    memory_service.set_fact(db, env, alex.web(), space.id, "budget", "$3,000")
    assert unset() == ["Dates", "Destination", "Headcount"]
    memory_service.set_fact(db, env, alex.via("ChatGPT"), space.id, "Dates", "Dec 20")
    memory_service.set_fact(db, env, alex.web(), space.id, "Destination", "Goa")
    memory_service.set_fact(db, env, alex.web(), space.id, "Headcount", "6")
    assert unset() == []


def test_a_fact_outside_the_template_is_still_allowed_and_changes_nothing_unset(
    db: Session, env: Env, alex: Person
) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip", builtin_template("trip"))

    memory_service.set_fact(db, env, alex.web(), space.id, "Pets", "A dog")

    detail = overview_service.get_space_detail(db, alex.id, space.id)
    assert [fact.key for fact in detail.facts] == ["Pets"]
    assert [fact.key for fact in detail.unset_facts] == [
        "Dates",
        "Destination",
        "Headcount",
        "Budget",
    ]


def test_the_space_context_carries_the_template_and_its_unset_facts(
    db: Session, env: Env, alex: Person
) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip", builtin_template("trip"))
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")

    context = overview_service.get_space_context(db, alex.id, space.id, env.now())

    assert context.space.template.name == "Trip"
    assert [fact.key for fact in context.unset_facts] == ["Destination", "Headcount", "Budget"]
    assert context.space.template.tips == (
        "Share a shortlist of places to stay",
        "Add the dates everyone can make",
        "Set a budget",
    )


def test_a_space_whose_stored_template_became_invalid_falls_back_to_general(
    db: Session, env: Env, alex: Person, caplog: pytest.LogCaptureFixture
) -> None:
    space = spaces_service.create_space(db, env, alex.web(), "Trip", builtin_template("trip"))
    row = db.get(Space, space.id)
    assert row is not None
    row.template = {"name": "", "plan_sections": 7}
    db.commit()

    view = spaces_service.get_space_view(db, alex.id, space.id)

    assert view.template == general_template()
    assert "no longer valid" in caplog.text
    assert [
        fact.key for fact in overview_service.get_space_detail(db, alex.id, space.id).facts
    ] == []


def test_deleting_a_space_does_not_keep_the_custom_template_text(
    db: Session, env: Env, alex: Person
) -> None:
    custom = templates_service.choose_template(None, DRAFTED)
    space = spaces_service.create_space(db, env, alex.web(), "Garden", custom)

    spaces_service.delete_space(db, env, alex.web(), space.id)

    row = db.get(Space, space.id)
    assert row is not None
    assert row.template_id == "general"
    assert "Garden club" not in str(row.template)


def test_a_valid_draft_comes_back_for_the_person_to_confirm_and_saves_nothing(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    spaces_before = db.scalar(select(func.count()).select_from(Space))

    draft = templates_service.draft_template(db, env, alex.web(), "  a   garden\nclub ")

    assert draft.drafted is True
    assert draft.template.id == "custom"
    assert draft.template.name == "Garden club"
    assert [fact.key for fact in draft.template.facts] == ["Plot", "Watering rota"]
    assert draft.template.plan_sections[-1] == "To settle"
    assert drafter.purposes == ["a garden club"]
    assert db.scalar(select(func.count()).select_from(Space)) == spaces_before


def test_an_invalid_draft_is_retried_once_and_the_second_try_can_succeed(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.replies = ["this is not json", drafted_reply()]

    draft = templates_service.draft_template(db, env, alex.web(), "garden club")

    assert draft.drafted is True
    assert len(drafter.purposes) == 2


def test_two_invalid_drafts_offer_general_instead(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.replies = [drafted_reply(name=""), "[1, 2]"]

    draft = templates_service.draft_template(db, env, alex.web(), "garden club")

    assert draft.drafted is False
    assert draft.template is general_template()
    assert len(drafter.purposes) == 2


@pytest.mark.parametrize(
    "reply",
    [
        "```json\n" + drafted_reply() + "\n```",
        "```\n" + drafted_reply() + "\n```",
        "  " + drafted_reply() + "\n",
        drafted_reply(id="trip", notes="extra field the model added"),
    ],
)
def test_a_draft_survives_fences_whitespace_and_stray_fields(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter, reply: str
) -> None:
    drafter.replies = [reply]

    draft = templates_service.draft_template(db, env, alex.web(), "garden club")

    assert draft.drafted is True
    assert draft.template.id == "custom"
    assert len(drafter.purposes) == 1


def test_a_draft_that_breaks_a_limit_is_treated_as_invalid(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    too_many = [f"Section {n}" for n in range(8)]
    drafter.replies = [drafted_reply(plan_sections=too_many), drafted_reply(tips=["t"] * 6)]

    draft = templates_service.draft_template(db, env, alex.web(), "garden club")

    assert draft.drafted is False


def test_drafting_without_a_model_says_so_and_calls_nothing(
    db: Session, env: Env, alex: Person
) -> None:
    actor = alex.web()

    with pytest.raises(Unavailable) as raised:
        templates_service.draft_template(db, env, actor, "garden club")

    assert "not set up on this server" in raised.value.message
    assert "General" in raised.value.message


def test_the_purpose_must_be_present_and_short(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    actor = alex.web()
    too_long = "x" * (TEMPLATE_PURPOSE_MAX + 1)
    with pytest.raises(InvalidInput):
        templates_service.draft_template(db, env, actor, "   ")
    with pytest.raises(TooLong):
        templates_service.draft_template(db, env, actor, too_long)

    assert drafter.purposes == []
    assert templates_service.draft_template(db, env, actor, "x" * TEMPLATE_PURPOSE_MAX)


def test_a_model_failure_is_reported_as_unavailable(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.error = CombineFailed("The AI service is busy right now. Try again in a minute.")
    actor = alex.web()

    with pytest.raises(Unavailable) as raised:
        templates_service.draft_template(db, env, actor, "garden club")

    assert raised.value.message == "The AI service is busy right now. Try again in a minute."


def test_a_person_gets_five_drafts_a_day_then_waits_until_tomorrow(
    db: Session, env: Env, clock: FakeClock, alex: Person, blake: Person, drafter: FakeDrafter
) -> None:
    actor = alex.web()
    for _ in range(DRAFTS_PER_DAY):
        templates_service.draft_template(db, env, actor, "garden club")

    with pytest.raises(RateLimited) as raised:
        templates_service.draft_template(db, env, actor, "garden club")

    assert "all your template drafts for today" in raised.value.message
    assert len(drafter.purposes) == DRAFTS_PER_DAY
    assert templates_service.draft_template(db, env, blake.web(), "book club").drafted is True
    clock.advance(hours=25)
    assert templates_service.draft_template(db, env, alex.web(), "garden club").drafted is True


def test_an_invalid_or_unavailable_draft_still_uses_up_the_allowance(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.replies = ["nope"]
    actor = alex.web()
    for _ in range(DRAFTS_PER_DAY):
        templates_service.draft_template(db, env, actor, "garden club")

    with pytest.raises(RateLimited):
        templates_service.draft_template(db, env, actor, "garden club")


GOA = "Goa trip with college friends, Dec 20-27, 6 of us, about 15k each"


def test_suggest_returns_values_and_base(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.base_template_id == "trip"
    assert suggestion.template.id == "custom"
    assert suggestion.template.name == "Trip"
    assert [(fact.key, fact.value) for fact in suggestion.facts] == [
        ("Dates", "Dec 20\u201327"),
        ("Headcount", "6"),
        ("Budget", "\u20b915,000 each"),
    ]
    assert suggestion.name == "Goa trip"
    assert drafter.suggestions == [GOA]


def test_suggest_drops_values_for_unknown_keys(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = [
        suggested_reply(
            values={
                "Stay": "Taj",
                "Budget": "x" * (MEMORY_VALUE_MAX + 1),
                "dates": "Dec 20",
                "HEADCOUNT": "6",
            }
        )
    ]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert [(fact.key, fact.value) for fact in suggestion.facts] == [
        ("Dates", "Dec 20"),
        ("Headcount", "6"),
    ]


def test_suggest_unknown_base_records_general(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = [suggested_reply(base="spaceship")]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.base_template_id == "general"
    assert suggestion.template.name == "Blank"


def test_suggest_falls_back_after_two_invalid_replies(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = ["not json", "[1]"]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is False
    assert suggestion.template is general_template()
    assert suggestion.facts == ()
    assert suggestion.name == ""
    assert len(drafter.suggestions) == 2


def test_suggest_invalid_space_name_becomes_empty(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = [suggested_reply(name="x" * 500)]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.name == ""


def test_suggest_shares_draft_limit(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    actor = alex.web()
    for _ in range(DRAFTS_PER_DAY):
        templates_service.draft_template(db, env, actor, "garden club")

    with pytest.raises(RateLimited) as raised:
        templates_service.suggest_space(db, env, actor, GOA)

    assert raised.value.message == templates_service.DRAFT_LIMIT_REACHED


def test_suggest_without_drafter_is_unavailable(db: Session, env: Env, alex: Person) -> None:
    with pytest.raises(Unavailable) as raised:
        templates_service.suggest_space(db, env, alex.web(), GOA)

    assert raised.value.message == templates_service.DRAFTING_NOT_SET_UP


def test_suggest_model_failure_is_unavailable(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.error = CombineFailed("busy")

    with pytest.raises(Unavailable) as raised:
        templates_service.suggest_space(db, env, alex.web(), GOA)

    assert raised.value.message == "busy"


def test_suggest_thin_reply_keeps_the_base_structure(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = [json.dumps({"base": "trip", "name": "Goa trip", "tips": []})]
    trip = builtin_template("trip")

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.template.name == trip.name
    assert suggestion.template.facts == trip.facts
    assert suggestion.template.plan_sections == trip.plan_sections
    assert suggestion.template.tips == trip.tips
    assert suggestion.template.combine_hint == trip.combine_hint
    assert suggestion.facts == ()


@pytest.mark.parametrize("values", [["Budget", "6"], "Budget: 6", None, 7])
def test_suggest_values_of_the_wrong_shape_give_no_facts(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter, values: Any
) -> None:
    drafter.suggest_replies = [suggested_reply(values=values)]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.facts == ()


def test_suggest_a_value_that_is_not_text_is_dropped(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = [suggested_reply(values={"Budget": 15000, "Headcount": "6"})]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert [(fact.key, fact.value) for fact in suggestion.facts] == [("Headcount", "6")]


@pytest.mark.parametrize("base", [1, None, ["trip"]])
def test_suggest_a_base_that_is_not_text_records_general(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter, base: Any
) -> None:
    drafter.suggest_replies = [suggested_reply(base=base)]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.base_template_id == "general"
    assert suggestion.template.name == "Blank"


@pytest.mark.parametrize("name", [5, None, ["Goa"]])
def test_suggest_a_name_that_is_not_text_becomes_empty(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter, name: Any
) -> None:
    drafter.suggest_replies = [suggested_reply(name=name)]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.name == ""


def test_suggest_an_invalid_first_reply_is_retried(
    db: Session, env: Env, alex: Person, drafter: FakeDrafter
) -> None:
    drafter.suggest_replies = ["nonsense", suggested_reply()]

    suggestion = templates_service.suggest_space(db, env, alex.web(), GOA)

    assert suggestion.suggested is True
    assert suggestion.name == "Goa trip"
    assert len(drafter.suggestions) == 2
