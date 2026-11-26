from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from orbit.errors import Conflict, InvalidInput, RateLimited, Unavailable
from orbit.events import PLAN_ADDED, SpaceEvent
from orbit.limits import (
    COMBINE_CHAR_BUDGET,
    COMBINE_FACT_OVERHEAD,
    COMBINE_INSTRUCTION_MAX,
    COMBINE_MAX_ITEMS,
    COMBINE_MIN_ITEM_CHARS,
    COMBINE_TITLE,
    COMBINE_WINDOW,
    COMBINES_PER_SPACE_PER_DAY,
    CONTENT_MAX,
)
from orbit.llm import CombineFailed, FactInput, ItemInput
from orbit.models import Item, User, new_id
from orbit.services import ai_uses
from orbit.services.context import AUTHOR_ORBIT, KIND_NOTE, KIND_PLAN, Actor, Env
from orbit.services.items import item_views, latest_plan
from orbit.services.memory import current_facts
from orbit.services.notify import plan_activity
from orbit.services.spaces import require_member
from orbit.services.views import FactView, ItemView
from orbit.space_templates import read_stored_template
from orbit.text import clean_block, clean_single_line, truncate

TRUNCATION_MARKER = "\n[Shortened to fit the length limit.]"
NOTHING_TO_COMBINE = "There is nothing to combine yet. Share something first."
NOT_CONFIGURED = "Combining is not set up on this server."


@dataclass(frozen=True)
class CombineResult:
    item: ItemView
    created: bool


@dataclass(frozen=True)
class Gathered:
    facts: list[FactView]
    items: list[ItemView]
    omitted: int
    newest: datetime | None


def _notes_filter(space_id: str) -> tuple[ColumnElement[bool], ...]:
    return (Item.space_id == space_id, Item.kind == KIND_NOTE, Item.retracted_at.is_(None))


def gather(db: Session, space_id: str) -> Gathered:
    facts = current_facts(db, space_id)
    notes = list(
        db.scalars(
            select(Item)
            .where(*_notes_filter(space_id))
            .order_by(Item.created_at.desc(), Item.id.desc())
            .limit(COMBINE_MAX_ITEMS)
        )
    )
    total = db.scalar(select(func.count()).select_from(Item).where(*_notes_filter(space_id))) or 0
    views = item_views(db, notes)
    fact_chars = sum(len(fact.key) + len(fact.value) + COMBINE_FACT_OVERHEAD for fact in facts)
    budget = max(COMBINE_CHAR_BUDGET - fact_chars, COMBINE_MIN_ITEM_CHARS)
    chosen: list[ItemView] = []
    used = 0
    for view in views:
        size = len(view.title) + len(view.content)
        if used + size <= budget:
            chosen.append(view)
            used += size
            continue
        if not chosen:
            room = max(budget - len(view.title), COMBINE_MIN_ITEM_CHARS)
            shortened, _cut = truncate(view.content, room)
            chosen.append(replace(view, content=shortened + TRUNCATION_MARKER))
        break
    chosen.reverse()
    stamps = [fact.created_at for fact in facts] + [view.created_at for view in views[:1]]
    return Gathered(
        facts=facts,
        items=chosen,
        omitted=total - len(chosen),
        newest=max(stamps) if stamps else None,
    )


def _inputs(gathered: Gathered) -> tuple[list[FactInput], list[ItemInput]]:
    facts = [
        FactInput(
            key=fact.key,
            value=fact.value,
            set_by=fact.set_by_name,
            via=fact.via,
            at=fact.created_at,
        )
        for fact in gathered.facts
    ]
    items = [
        ItemInput(
            title=item.title,
            content=item.content,
            shared_by=item.shared_by_name,
            via=item.via,
            at=item.created_at,
        )
        for item in gathered.items
    ]
    return facts, items


def _clean_instruction(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    return clean_single_line(raw, "Instruction", COMBINE_INSTRUCTION_MAX)


def _plans_in_window(db: Session, space_id: str, now: datetime) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Item)
            .where(
                Item.space_id == space_id,
                Item.kind == KIND_PLAN,
                Item.created_at >= now - COMBINE_WINDOW,
            )
        )
        or 0
    )


def _save_plan(
    db: Session, env: Env, actor: Actor, space_id: str, gathered: Gathered, text: str
) -> CombineResult:
    body, _cut = truncate(text, CONTENT_MAX)
    item = Item(
        id=new_id(),
        space_id=space_id,
        kind=KIND_PLAN,
        title=COMBINE_TITLE,
        content=clean_block(body, "Plan", CONTENT_MAX),
        author_kind=AUTHOR_ORBIT,
        shared_by=None,
        via=actor.via,
        source_item_ids=[item.id for item in gathered.items],
        created_at=env.now(),
    )
    db.add(item)
    db.commit()
    env.events.publish(SpaceEvent(PLAN_ADDED, space_id, {"item_id": item.id}))
    requester = db.get(User, actor.user_id)
    env.notifier.record(
        db,
        space_id,
        actor.user_id,
        plan_activity(
            requester.display_name if requester else "Someone", actor.via, item.created_at
        ),
    )
    view = item_views(db, [item])[0]
    db.commit()
    return CombineResult(item=view, created=True)


def combine_space(
    db: Session, env: Env, actor: Actor, space_id: str, instruction: str | None
) -> CombineResult:
    space = require_member(db, actor.user_id, space_id)
    if env.llm is None:
        raise Unavailable(NOT_CONFIGURED)
    template = read_stored_template(space.template_id, space.template)
    steer = _clean_instruction(instruction)
    gathered = gather(db, space_id)
    if not gathered.facts and not gathered.items:
        raise InvalidInput(NOTHING_TO_COMBINE)
    existing = latest_plan(db, space_id)
    nothing_new = (
        existing is not None
        and gathered.newest is not None
        and gathered.newest <= existing.created_at
    )
    if steer is None and existing is not None and nothing_new:
        db.commit()
        return CombineResult(item=existing, created=False)
    if _plans_in_window(db, space_id, env.now()) >= COMBINES_PER_SPACE_PER_DAY:
        raise RateLimited(
            f"This space has used all {COMBINES_PER_SPACE_PER_DAY} combines for today. "
            "Try again tomorrow."
        )
    if not env.combines.try_acquire(space_id):
        raise Conflict(
            "Orbit is already combining this space. Try again in a moment."
            if env.combines.holds(space_id)
            else "Orbit is busy combining other spaces. Try again in a minute."
        )
    try:
        db.commit()
        reservation = ai_uses.reserve(db, env, actor.user_id, ai_uses.KIND_COMBINE)
        facts, items = _inputs(gathered)
        try:
            text = env.llm(facts, items, steer, gathered.omitted, template)
        except CombineFailed as exc:
            ai_uses.refund(db, env, reservation)
            raise Unavailable(exc.message) from exc
        except Exception:
            ai_uses.refund(db, env, reservation)
            raise
        return _save_plan(db, env, actor, space_id, gathered, text)
    finally:
        env.combines.release(space_id)
