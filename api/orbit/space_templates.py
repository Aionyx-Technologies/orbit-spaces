from __future__ import annotations

import logging
import re
import tomllib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from functools import lru_cache
from pathlib import Path
from typing import Any

from orbit.errors import InvalidInput, OrbitError
from orbit.limits import (
    MEMORY_KEY_MAX,
    TEMPLATE_COMBINE_HINT_MAX,
    TEMPLATE_DESCRIPTION_MAX,
    TEMPLATE_FACT_HINT_MAX,
    TEMPLATE_FACTS_MAX,
    TEMPLATE_ID_MAX,
    TEMPLATE_NAME_MAX,
    TEMPLATE_SECTION_MAX,
    TEMPLATE_SECTIONS_MAX,
    TEMPLATE_TIP_MAX,
    TEMPLATE_TIPS_MAX,
)
from orbit.text import clean_single_line

logger = logging.getLogger("orbit.templates")

GENERAL_ID = "general"
CUSTOM_ID = "custom"
SETTLE_SECTION = "To settle"
TEMPLATE_DIR = Path(__file__).resolve().parent / "templates" / "spaces"
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TEMPLATE_FIELDS = frozenset(
    {"id", "name", "description", "facts", "plan_sections", "combine_hint", "tips"}
)
FACT_FIELDS = frozenset({"key", "hint"})
RESERVED_IDS = frozenset({CUSTOM_ID})
TEMPLATE_ALIASES = {"family-vacation": "trip", "friends-trip": "trip"}
ICON_MAX = 8
ABSURD_LIST_LENGTH = 100


class InvalidTemplate(InvalidInput):
    code = "invalid_template"


class TemplateFileError(Exception):
    pass


@dataclass(frozen=True)
class TemplateFact:
    key: str
    hint: str


@dataclass(frozen=True)
class SpaceTemplate:
    id: str
    name: str
    description: str
    facts: tuple[TemplateFact, ...]
    plan_sections: tuple[str, ...]
    combine_hint: str
    tips: tuple[str, ...]
    icon: str = field(default="", compare=False)
    order: int = field(default=100, compare=False)


def _required_text(value: object, label: str, max_length: int) -> str:
    if value is None:
        raise InvalidTemplate(f"{label} is required.")
    if not isinstance(value, str):
        raise InvalidTemplate(f"{label} must be text.")
    return clean_single_line(value, label, max_length)


def _optional_text(value: object, label: str, max_length: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise InvalidTemplate(f"{label} must be text.")
    if not value.strip():
        return ""
    return clean_single_line(value, label, max_length)


def _items(value: object, label: str) -> list[Any]:
    if value is None:
        return []
    if not isinstance(value, list | tuple):
        raise InvalidTemplate(f"{label} must be a list.")
    if len(value) > ABSURD_LIST_LENGTH:
        raise InvalidTemplate(f"{label} has too many entries.")
    return list(value)


def _reject_unknown(data: Mapping[str, Any], allowed: frozenset[str], label: str) -> None:
    unknown = sorted(str(name) for name in data if name not in allowed)
    if unknown:
        raise InvalidTemplate(f"{label} has unknown fields: {', '.join(unknown)}.")


def _check_id(value: str) -> str:
    if len(value) > TEMPLATE_ID_MAX or not ID_PATTERN.fullmatch(value):
        raise InvalidTemplate(
            f"A template id uses lowercase letters, digits and hyphens, "
            f"at most {TEMPLATE_ID_MAX} characters."
        )
    return value


def _parse_fact(raw: object) -> TemplateFact:
    if not isinstance(raw, Mapping):
        raise InvalidTemplate("Each suggested fact needs a key and a hint.")
    _reject_unknown(raw, FACT_FIELDS, "A suggested fact")
    return TemplateFact(
        key=_required_text(raw.get("key"), "Fact key", MEMORY_KEY_MAX),
        hint=_optional_text(raw.get("hint"), "Fact hint", TEMPLATE_FACT_HINT_MAX),
    )


def _parse_facts(value: object) -> tuple[TemplateFact, ...]:
    facts = [_parse_fact(raw) for raw in _items(value, "Facts")]
    if len(facts) > TEMPLATE_FACTS_MAX:
        raise InvalidTemplate(f"A template can suggest at most {TEMPLATE_FACTS_MAX} facts.")
    keys = [fact.key.casefold() for fact in facts]
    if len(set(keys)) != len(keys):
        raise InvalidTemplate("Each suggested fact needs a different key.")
    return tuple(facts)


def _parse_sections(value: object) -> tuple[str, ...]:
    cleaned = [
        _required_text(raw, "Plan section", TEMPLATE_SECTION_MAX)
        for raw in _items(value, "Plan sections")
    ]
    folded = [section.casefold() for section in cleaned]
    if len(set(folded)) != len(folded):
        raise InvalidTemplate("Each plan section needs a different name.")
    sections = [section for section in cleaned if section.casefold() != SETTLE_SECTION.casefold()]
    sections.append(SETTLE_SECTION)
    if len(sections) > TEMPLATE_SECTIONS_MAX:
        raise InvalidTemplate(
            f"A template can have at most {TEMPLATE_SECTIONS_MAX} plan sections, "
            f"counting {SETTLE_SECTION}."
        )
    return tuple(sections)


def _parse_tips(value: object) -> tuple[str, ...]:
    tips = [_required_text(raw, "Tip", TEMPLATE_TIP_MAX) for raw in _items(value, "Tips")]
    if len(tips) > TEMPLATE_TIPS_MAX:
        raise InvalidTemplate(f"A template can have at most {TEMPLATE_TIPS_MAX} tips.")
    return tuple(tips)


def parse_template(data: object, *, template_id: str | None = None) -> SpaceTemplate:
    if not isinstance(data, Mapping):
        raise InvalidTemplate("A template must be an object with named fields.")
    _reject_unknown(data, TEMPLATE_FIELDS, "A template")
    raw_id = template_id if template_id is not None else data.get("id")
    if not isinstance(raw_id, str):
        raise InvalidTemplate("A template needs an id.")
    return SpaceTemplate(
        id=_check_id(raw_id),
        name=_required_text(data.get("name"), "Template name", TEMPLATE_NAME_MAX),
        description=_optional_text(
            data.get("description"), "Template description", TEMPLATE_DESCRIPTION_MAX
        ),
        facts=_parse_facts(data.get("facts")),
        plan_sections=_parse_sections(data.get("plan_sections")),
        combine_hint=_optional_text(
            data.get("combine_hint"), "Combine hint", TEMPLATE_COMBINE_HINT_MAX
        ),
        tips=_parse_tips(data.get("tips")),
    )


def template_to_dict(template: SpaceTemplate) -> dict[str, Any]:
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "facts": [{"key": fact.key, "hint": fact.hint} for fact in template.facts],
        "plan_sections": list(template.plan_sections),
        "combine_hint": template.combine_hint,
        "tips": list(template.tips),
    }


def custom_template(data: object) -> SpaceTemplate:
    return parse_template(data, template_id=CUSTOM_ID)


def unset_facts(template: SpaceTemplate, set_keys: Iterable[str]) -> list[TemplateFact]:
    present = {key.casefold() for key in set_keys}
    return [fact for fact in template.facts if fact.key.casefold() not in present]


def _load_file(path: Path) -> SpaceTemplate:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        raise TemplateFileError(f"{path.name} could not be read as TOML: {exc}") from exc
    declared = data.get("id")
    if declared != path.stem:
        raise TemplateFileError(
            f'{path.name} must declare id = "{path.stem}" so the id matches the file name.'
        )
    if path.stem in RESERVED_IDS:
        raise TemplateFileError(f'{path.name} uses the reserved id "{path.stem}".')
    data = dict(data)
    icon = data.pop("icon", "")
    order = data.pop("order", 100)
    if not isinstance(icon, str) or len(icon) > ICON_MAX:
        raise TemplateFileError(f"{path.name} icon must be text of at most {ICON_MAX} characters.")
    if not isinstance(order, int) or isinstance(order, bool):
        raise TemplateFileError(f"{path.name} order must be a whole number.")
    try:
        template = replace(parse_template(data), icon=icon, order=order)
    except OrbitError as exc:
        raise TemplateFileError(f"{path.name} is not a valid template: {exc.message}") from exc
    if not template.description:
        raise TemplateFileError(f"{path.name} needs a description for the template picker.")
    return template


def load_builtin_templates(directory: Path) -> dict[str, SpaceTemplate]:
    found = {path.stem: _load_file(path) for path in sorted(directory.glob("*.toml"))}
    general = found.pop(GENERAL_ID, None)
    if general is None:
        raise TemplateFileError(f"{GENERAL_ID}.toml is missing from {directory}.")
    ordered = sorted(
        [general, *found.values()],
        key=lambda template: (template.order, template.name.casefold(), template.id),
    )
    return {template.id: template for template in ordered}


@lru_cache(maxsize=1)
def builtin_templates() -> dict[str, SpaceTemplate]:
    return load_builtin_templates(TEMPLATE_DIR)


def general_template() -> SpaceTemplate:
    return builtin_templates()[GENERAL_ID]


def general_template_json() -> dict[str, Any]:
    return template_to_dict(general_template())


def builtin_template(template_id: str | None) -> SpaceTemplate:
    if template_id is None or not template_id.strip():
        return general_template()
    wanted = template_id.strip()
    found = builtin_templates().get(TEMPLATE_ALIASES.get(wanted, wanted))
    if found is None:
        available = ", ".join(builtin_templates())
        raise InvalidTemplate(
            f'There is no template "{wanted[:TEMPLATE_ID_MAX]}". Available templates: {available}.'
        )
    return found


def read_stored_template(template_id: str, stored: object) -> SpaceTemplate:
    try:
        return parse_template(stored, template_id=template_id)
    except OrbitError:
        logger.warning(
            "A space holds a template that is no longer valid. Using the general template "
            "for it instead. Stored template id: %s",
            template_id[:TEMPLATE_ID_MAX],
        )
        return general_template()
