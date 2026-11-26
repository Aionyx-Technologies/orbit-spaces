from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from sqlalchemy.orm import Session

from orbit.errors import InvalidInput, OrbitError, RateLimited, Unavailable
from orbit.events import TEMPLATE_CHANGED, SpaceEvent
from orbit.limits import SPACE_NAME_MAX, TEMPLATE_DRAFTS_PER_USER_PER_DAY, TEMPLATE_PURPOSE_MAX
from orbit.llm import CombineFailed, TemplateDrafter
from orbit.services import ai_uses
from orbit.services.context import Actor, Env
from orbit.services.memory import clean_fact_value
from orbit.services.spaces import require_member
from orbit.space_templates import (
    TEMPLATE_FIELDS,
    SpaceTemplate,
    builtin_template,
    builtin_templates,
    custom_template,
    general_template,
    parse_template,
    read_stored_template,
    template_to_dict,
)
from orbit.text import clean_single_line

DRAFTING_NOT_SET_UP = (
    "Drafting a template is not set up on this server. Start from General and edit it."
)
DRAFT_LIMIT_REACHED = "You have used all your template drafts for today. Try again tomorrow."
DRAFT_ATTEMPTS = 2
CODE_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL | re.IGNORECASE)

T = TypeVar("T")


@dataclass(frozen=True)
class Draft:
    template: SpaceTemplate
    drafted: bool


@dataclass(frozen=True)
class SuggestedFact:
    key: str
    value: str


@dataclass(frozen=True)
class Suggestion:
    suggested: bool
    name: str
    template: SpaceTemplate
    base_template_id: str
    facts: tuple[SuggestedFact, ...]


def choose_template(template_id: str | None, custom: object | None) -> SpaceTemplate:
    if template_id is not None and custom is not None:
        raise InvalidInput("Send either template_id or template, not both.")
    if custom is not None:
        return custom_template(custom)
    return builtin_template(template_id)


def get_space_template(db: Session, user_id: str, space_id: str) -> SpaceTemplate:
    space = require_member(db, user_id, space_id)
    return read_stored_template(space.template_id, space.template)


def set_space_template(
    db: Session, env: Env, actor: Actor, space_id: str, data: object
) -> SpaceTemplate:
    space = require_member(db, actor.user_id, space_id)
    template = parse_template(data, template_id=space.template_id)
    space.template = template_to_dict(template)
    db.commit()
    env.events.publish(SpaceEvent(TEMPLATE_CHANGED, space_id))
    return template


def _reply_object(reply: str) -> dict[str, object] | None:
    text = reply.strip()
    fenced = CODE_FENCE.match(text)
    if fenced:
        text = fenced.group(1)
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _template_from_reply(reply: str) -> SpaceTemplate | None:
    data = _reply_object(reply)
    if data is None:
        return None
    known = {name: value for name, value in data.items() if name in TEMPLATE_FIELDS}
    try:
        return custom_template(known)
    except OrbitError:
        return None


def _ask_drafter(
    db: Session,
    env: Env,
    actor: Actor,
    purpose: str,
    kind: str,
    ask: Callable[[TemplateDrafter, str], str],
    parse: Callable[[str], T | None],
) -> T | None:
    """Every AI setup call shares this: the purpose rules, the budgets and the retries.

    Costs one AI use, however many attempts it takes, and gives it back when no attempt
    produced something usable. Returns the first reply that parses, or None.
    """
    clean_purpose = clean_single_line(purpose, "Purpose", TEMPLATE_PURPOSE_MAX)
    if env.drafter is None:
        raise Unavailable(DRAFTING_NOT_SET_UP)
    if not env.limiter.allow(f"template-draft:{actor.user_id}", TEMPLATE_DRAFTS_PER_USER_PER_DAY):
        raise RateLimited(DRAFT_LIMIT_REACHED)
    reservation = ai_uses.reserve(db, env, actor.user_id, kind)
    try:
        for _ in range(DRAFT_ATTEMPTS):
            try:
                reply = ask(env.drafter, clean_purpose)
            except CombineFailed as exc:
                raise Unavailable(exc.message) from exc
            parsed = parse(reply)
            if parsed is not None:
                return parsed
    except BaseException:
        ai_uses.refund(db, env, reservation)
        raise
    ai_uses.refund(db, env, reservation)
    return None


def draft_template(db: Session, env: Env, actor: Actor, purpose: str) -> Draft:
    template = _ask_drafter(
        db,
        env,
        actor,
        purpose,
        ai_uses.KIND_TEMPLATE_DRAFT,
        lambda drafter, text: drafter(text),
        _template_from_reply,
    )
    if template is None:
        return Draft(template=general_template(), drafted=False)
    return Draft(template=template, drafted=True)


def _suggested_name(raw: object) -> str:
    if not isinstance(raw, str):
        return ""
    try:
        return clean_single_line(raw, "Space name", SPACE_NAME_MAX)
    except OrbitError:
        return ""


def _suggested_facts(template: SpaceTemplate, raw: object) -> tuple[SuggestedFact, ...]:
    if not isinstance(raw, dict):
        return ()
    given = {
        key.casefold(): value
        for key, value in raw.items()
        if isinstance(key, str) and isinstance(value, str)
    }
    facts: list[SuggestedFact] = []
    for fact in template.facts:
        value = given.get(fact.key.casefold())
        if value is None:
            continue
        try:
            facts.append(SuggestedFact(fact.key, clean_fact_value(value)))
        except OrbitError:
            continue
    return tuple(facts)


def _suggestion_from_reply(reply: str) -> Suggestion | None:
    data = _reply_object(reply)
    if data is None:
        return None
    builtins = builtin_templates()
    base = data.get("base")
    base_id = base if isinstance(base, str) and base in builtins else "general"
    # The template is named after its base, so the space name never has to fit the template
    # name limit and an over-long space name cannot sink an otherwise good reply.
    base_fields = template_to_dict(builtins[base_id])
    # A field the model left out or sent empty keeps the base template's version.
    known = {
        name: data[name] if data.get(name) else base_fields[name]
        for name in TEMPLATE_FIELDS
        if name != "name"
    }
    known["name"] = base_fields["name"]
    try:
        template = custom_template(known)
    except OrbitError:
        return None
    return Suggestion(
        suggested=True,
        name=_suggested_name(data.get("name")),
        template=template,
        base_template_id=base_id,
        facts=_suggested_facts(template, data.get("values")),
    )


def suggest_space(db: Session, env: Env, actor: Actor, purpose: str) -> Suggestion:
    templates = list(builtin_templates().values())
    suggestion = _ask_drafter(
        db,
        env,
        actor,
        purpose,
        ai_uses.KIND_SPACE_SETUP,
        lambda drafter, text: drafter.suggest(text, templates),
        _suggestion_from_reply,
    )
    if suggestion is not None:
        return suggestion
    return Suggestion(
        suggested=False,
        name="",
        template=general_template(),
        base_template_id="general",
        facts=(),
    )
