from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pytest

from orbit import space_templates
from orbit.errors import InvalidInput, TooLong
from orbit.limits import (
    MEMORY_KEY_MAX,
    TEMPLATE_COMBINE_HINT_MAX,
    TEMPLATE_DESCRIPTION_MAX,
    TEMPLATE_FACT_HINT_MAX,
    TEMPLATE_FACTS_MAX,
    TEMPLATE_NAME_MAX,
    TEMPLATE_SECTION_MAX,
    TEMPLATE_SECTIONS_MAX,
    TEMPLATE_TIP_MAX,
    TEMPLATE_TIPS_MAX,
)
from orbit.main import create_app
from orbit.space_templates import (
    CUSTOM_ID,
    GENERAL_ID,
    SETTLE_SECTION,
    TEMPLATE_DIR,
    InvalidTemplate,
    TemplateFact,
    TemplateFileError,
    builtin_template,
    builtin_templates,
    custom_template,
    general_template,
    load_builtin_templates,
    parse_template,
    read_stored_template,
    template_to_dict,
    unset_facts,
)


def base() -> dict[str, Any]:
    return {
        "name": "Trip",
        "description": "Plan a trip",
        "facts": [{"key": "Dates", "hint": "When"}],
        "plan_sections": ["Stay", "Costs"],
        "combine_hint": "Be fair.",
        "tips": ["Start here"],
    }


def write_template(directory: Path, template_id: str, body: str | None = None) -> Path:
    path = directory / f"{template_id}.toml"
    path.write_text(
        body
        or f'id = "{template_id}"\nname = "Name {template_id}"\n'
        'description = "A description"\nplan_sections = ["One"]\n',
        encoding="utf-8",
    )
    return path


def test_every_built_in_file_loads_and_is_valid() -> None:
    templates = load_builtin_templates(TEMPLATE_DIR)

    files = sorted(path.stem for path in TEMPLATE_DIR.glob("*.toml"))
    assert sorted(templates) == files
    for template_id, template in templates.items():
        assert template.id == template_id
        assert template.description
        assert template.plan_sections[-1] == SETTLE_SECTION
        assert len(template.facts) <= TEMPLATE_FACTS_MAX


def test_builtins_are_the_eight_chips_in_order() -> None:
    assert list(builtin_templates()) == [
        "trip",
        "holiday-gifts",
        "household",
        "dinner-party",
        "event",
        "freelancer-client",
        "team-project",
        "general",
    ]
    assert builtin_templates()["general"].name == "Blank"
    assert builtin_templates()["freelancer-client"].name == "Client project"
    assert builtin_templates()["trip"].icon == "✈️"


def test_old_ids_resolve_to_trip() -> None:
    assert builtin_template("family-vacation").id == "trip"
    assert builtin_template("friends-trip").id == "trip"


def test_stored_copy_of_removed_template_still_reads() -> None:
    stored = {
        "id": "family-vacation",
        "name": "Family vacation",
        "description": "Plan a trip together",
        "facts": [{"key": "Dates", "hint": "When"}],
        "plan_sections": ["Costs", "To settle"],
        "combine_hint": "",
        "tips": [],
    }
    assert read_stored_template("family-vacation", stored).name == "Family vacation"


def test_icon_and_order_are_not_stored_in_space_copies() -> None:
    assert "icon" not in template_to_dict(builtin_templates()["trip"])
    assert "order" not in template_to_dict(builtin_templates()["trip"])


def test_custom_templates_still_reject_icon_and_order() -> None:
    with pytest.raises(InvalidTemplate):
        parse_template({**base(), "icon": "x"}, template_id="mine")


def test_general_has_no_suggested_facts_and_the_three_default_sections() -> None:
    general = general_template()

    assert general.id == GENERAL_ID
    assert general.facts == ()
    assert general.plan_sections == ("Summary", "Next steps", "To settle")


def test_trip_has_the_planned_sections_and_facts() -> None:
    template = builtin_template("trip")

    assert template.name == "Trip"
    assert template.description == "Plan a trip together"
    assert template.plan_sections == (
        "Where to stay",
        "Getting there",
        "Things to do",
        "Costs and splitting",
        "To settle",
    )
    assert [fact.key for fact in template.facts] == [
        "Dates",
        "Destination",
        "Headcount",
        "Budget",
    ]


def test_no_template_given_means_general() -> None:
    assert builtin_template(None) is general_template()
    assert builtin_template("  ") is general_template()


def test_an_unknown_template_lists_the_ones_that_exist() -> None:
    with pytest.raises(InvalidTemplate) as raised:
        builtin_template("pirate-ship")

    assert 'There is no template "pirate-ship".' in raised.value.message
    assert "trip, holiday-gifts" in raised.value.message
    assert "family-vacation" not in raised.value.message


def test_a_long_unknown_id_is_clipped_in_the_message() -> None:
    with pytest.raises(InvalidTemplate) as raised:
        builtin_template("x" * 500)

    assert "x" * 41 not in raised.value.message


def test_a_valid_template_round_trips_through_json() -> None:
    template = custom_template(base())

    again = parse_template(template_to_dict(template))

    assert again == template
    assert template.id == CUSTOM_ID


def test_the_values_at_every_limit_are_accepted() -> None:
    data = {
        "name": "n" * TEMPLATE_NAME_MAX,
        "description": "d" * TEMPLATE_DESCRIPTION_MAX,
        "facts": [
            {"key": f"{index}".ljust(MEMORY_KEY_MAX, "k"), "hint": "h" * TEMPLATE_FACT_HINT_MAX}
            for index in range(TEMPLATE_FACTS_MAX)
        ],
        "plan_sections": [
            f"{index}".ljust(TEMPLATE_SECTION_MAX, "s")
            for index in range(TEMPLATE_SECTIONS_MAX - 1)
        ],
        "combine_hint": "c" * TEMPLATE_COMBINE_HINT_MAX,
        "tips": [f"{index}".ljust(TEMPLATE_TIP_MAX, "t") for index in range(TEMPLATE_TIPS_MAX)],
    }

    template = custom_template(data)

    assert len(template.facts) == TEMPLATE_FACTS_MAX
    assert len(template.plan_sections) == TEMPLATE_SECTIONS_MAX
    assert len(template.tips) == TEMPLATE_TIPS_MAX


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"name": "n" * (TEMPLATE_NAME_MAX + 1)}, "Template name is too long"),
        ({"description": "d" * (TEMPLATE_DESCRIPTION_MAX + 1)}, "Template description is too long"),
        (
            {"facts": [{"key": "k" * (MEMORY_KEY_MAX + 1), "hint": ""}]},
            "Fact key is too long",
        ),
        (
            {"facts": [{"key": "Dates", "hint": "h" * (TEMPLATE_FACT_HINT_MAX + 1)}]},
            "Fact hint is too long",
        ),
        ({"plan_sections": ["s" * (TEMPLATE_SECTION_MAX + 1)]}, "Plan section is too long"),
        ({"combine_hint": "c" * (TEMPLATE_COMBINE_HINT_MAX + 1)}, "Combine hint is too long"),
        ({"tips": ["t" * (TEMPLATE_TIP_MAX + 1)]}, "Tip is too long"),
    ],
)
def test_a_value_over_its_limit_is_refused_with_a_plain_message(
    change: dict[str, Any], message: str
) -> None:
    with pytest.raises(TooLong) as raised:
        custom_template({**base(), **change})

    assert message in raised.value.message


def test_too_many_facts_or_tips_are_refused() -> None:
    too_many_facts = [{"key": f"Fact {n}", "hint": ""} for n in range(TEMPLATE_FACTS_MAX + 1)]
    too_many_tips = [f"Tip {n}" for n in range(TEMPLATE_TIPS_MAX + 1)]

    with pytest.raises(InvalidTemplate) as facts:
        custom_template({**base(), "facts": too_many_facts})
    with pytest.raises(InvalidTemplate) as tips:
        custom_template({**base(), "tips": too_many_tips})

    assert f"at most {TEMPLATE_FACTS_MAX} facts" in facts.value.message
    assert f"at most {TEMPLATE_TIPS_MAX} tips" in tips.value.message


def test_to_settle_is_added_last_when_a_template_leaves_it_out() -> None:
    template = custom_template({**base(), "plan_sections": ["Stay", "Costs"]})

    assert template.plan_sections == ("Stay", "Costs", "To settle")


@pytest.mark.parametrize("spelling", ["To settle", "to settle", "TO SETTLE", " To   settle "])
def test_to_settle_written_in_the_middle_moves_to_the_end(spelling: str) -> None:
    template = custom_template({**base(), "plan_sections": ["Stay", spelling, "Costs"]})

    assert template.plan_sections == ("Stay", "Costs", "To settle")


def test_a_template_cannot_drop_to_settle_by_leaving_the_list_empty() -> None:
    template = custom_template({**base(), "plan_sections": []})

    assert template.plan_sections == ("To settle",)


def test_the_section_limit_counts_to_settle() -> None:
    fits = [f"Part {n}" for n in range(TEMPLATE_SECTIONS_MAX - 1)]
    overflows = [f"Part {n}" for n in range(TEMPLATE_SECTIONS_MAX)]

    assert len(custom_template({**base(), "plan_sections": fits}).plan_sections) == 8
    with pytest.raises(InvalidTemplate) as raised:
        custom_template({**base(), "plan_sections": overflows})
    assert "at most 8 plan sections, counting To settle" in raised.value.message


def test_duplicate_sections_and_facts_are_refused_ignoring_case() -> None:
    with pytest.raises(InvalidTemplate):
        custom_template({**base(), "plan_sections": ["Stay", "stay"]})
    with pytest.raises(InvalidTemplate):
        custom_template(
            {**base(), "facts": [{"key": "Dates", "hint": ""}, {"key": "dates", "hint": ""}]}
        )


def test_whitespace_is_tidied_and_blank_required_text_is_refused() -> None:
    template = custom_template({**base(), "name": "  Family \n  trip ", "tips": ["  Go  "]})

    assert template.name == "Family trip"
    assert template.tips == ("Go",)
    with pytest.raises(InvalidInput):
        custom_template({**base(), "name": "   "})
    with pytest.raises(InvalidInput):
        custom_template({**base(), "tips": [""]})


def test_the_optional_fields_default_to_empty() -> None:
    template = custom_template({"name": "Bare"})

    assert template.description == ""
    assert template.facts == ()
    assert template.combine_hint == ""
    assert template.tips == ()
    assert template.plan_sections == ("To settle",)


@pytest.mark.parametrize(
    "bad",
    [
        {**base(), "typo_field": 1},
        {**base(), "facts": [{"key": "Dates", "hint": "x", "extra": 1}]},
        {**base(), "facts": "Dates"},
        {**base(), "facts": ["Dates"]},
        {**base(), "plan_sections": "Stay"},
        {**base(), "plan_sections": [1]},
        {**base(), "name": 5},
        {**base(), "tips": None, "combine_hint": 5},
    ],
)
def test_the_wrong_shape_is_refused_not_crashed_on(bad: dict[str, Any]) -> None:
    with pytest.raises(InvalidInput):
        custom_template(bad)


@pytest.mark.parametrize("not_an_object", [None, [], "text", 5])
def test_a_template_must_be_an_object(not_an_object: object) -> None:
    with pytest.raises(InvalidTemplate):
        custom_template(not_an_object)


@pytest.mark.parametrize("bad_id", ["Upper", "has space", "-lead", "trail-", "a--b", "", "x" * 41])
def test_a_template_id_uses_lowercase_digits_and_single_hyphens(bad_id: str) -> None:
    with pytest.raises(InvalidTemplate):
        parse_template(base(), template_id=bad_id)


def test_unset_facts_are_the_suggested_ones_without_a_current_value() -> None:
    template = builtin_template("trip")

    assert [fact.key for fact in unset_facts(template, [])] == [
        "Dates",
        "Destination",
        "Headcount",
        "Budget",
    ]
    assert unset_facts(template, ["dates", "BUDGET", "headcount"]) == [
        TemplateFact("Destination", "Where you are headed")
    ]
    assert (
        unset_facts(template, ["Dates", "Budget", "Destination", "Headcount", "Anything else"])
        == []
    )
    assert unset_facts(general_template(), ["Dates"]) == []


def test_a_stored_copy_is_read_back_with_the_spaces_template_id() -> None:
    stored = template_to_dict(builtin_template("team-project"))

    template = read_stored_template("team-project", stored)

    assert template == builtin_template("team-project")


@pytest.mark.parametrize(
    "broken",
    [None, "text", {"name": ""}, {**base(), "name": "n" * 500}, {**base(), "unknown": 1}],
)
def test_an_invalid_stored_copy_falls_back_to_general_and_logs_a_warning(
    broken: object, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.templates"):
        template = read_stored_template("family-vacation", broken)

    assert template is general_template()
    assert "no longer valid" in caplog.text
    assert "family-vacation" in caplog.text


def test_the_warning_never_prints_the_stored_content(caplog: pytest.LogCaptureFixture) -> None:
    secret = {"name": "Private plans for Dana", "plan_sections": 5}

    with caplog.at_level(logging.WARNING, logger="orbit.templates"):
        read_stored_template("custom", secret)

    assert "Dana" not in caplog.text


def test_a_valid_folder_loads_sorted_by_order_then_name(tmp_path: Path) -> None:
    write_template(tmp_path, "zebra")
    write_template(tmp_path, "general")
    write_template(tmp_path, "apple")

    templates = load_builtin_templates(tmp_path)

    assert list(templates) == ["apple", "general", "zebra"]


def test_a_missing_general_template_stops_loading(tmp_path: Path) -> None:
    write_template(tmp_path, "apple")

    with pytest.raises(TemplateFileError) as raised:
        load_builtin_templates(tmp_path)

    assert "general.toml is missing" in str(raised.value)


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        ("this is = = not toml", "apple.toml could not be read as TOML"),
        ('id = "pear"\nname = "Pear"\ndescription = "x"\n', 'must declare id = "apple"'),
        ('name = "Apple"\ndescription = "x"\n', 'must declare id = "apple"'),
        ('id = "apple"\ndescription = "x"\n', "Template name is required"),
        ('id = "apple"\nname = ""\ndescription = "x"\n', "Template name cannot be empty"),
        ('id = "apple"\nname = "Apple"\n', "needs a description"),
        ('id = "apple"\nname = "Apple"\ndescription = "x"\nbogus = 1\n', "unknown fields: bogus"),
        (
            'id = "apple"\nname = "Apple"\ndescription = "x"\ntips = ["a","b","c","d","e","f"]\n',
            "at most 5 tips",
        ),
    ],
)
def test_a_bad_file_stops_loading_and_names_the_file_and_the_problem(
    tmp_path: Path, body: str, fragment: str
) -> None:
    write_template(tmp_path, "general")
    write_template(tmp_path, "apple", body)

    with pytest.raises(TemplateFileError) as raised:
        load_builtin_templates(tmp_path)

    assert "apple.toml" in str(raised.value)
    assert fragment in str(raised.value)


def test_a_file_cannot_take_the_reserved_custom_id(tmp_path: Path) -> None:
    write_template(tmp_path, "general")
    write_template(tmp_path, "custom")

    with pytest.raises(TemplateFileError) as raised:
        load_builtin_templates(tmp_path)

    assert "reserved id" in str(raised.value)


def test_a_file_that_is_not_utf8_stops_loading(tmp_path: Path) -> None:
    write_template(tmp_path, "general")
    (tmp_path / "apple.toml").write_bytes(b"\xff\xfe\x00bad")

    with pytest.raises(TemplateFileError) as raised:
        load_builtin_templates(tmp_path)

    assert "apple.toml" in str(raised.value)


def test_starting_the_api_with_a_bad_built_in_template_fails_with_a_clear_message(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, settings: Any
) -> None:
    write_template(tmp_path, "general")
    write_template(tmp_path, "apple", 'id = "apple"\nname = ""\n')
    monkeypatch.setattr(space_templates, "TEMPLATE_DIR", tmp_path)
    builtin_templates.cache_clear()
    try:
        with pytest.raises(TemplateFileError) as raised:
            create_app(settings)
    finally:
        monkeypatch.undo()
        builtin_templates.cache_clear()

    assert "apple.toml is not a valid template" in str(raised.value)
