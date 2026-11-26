from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from orbit.errors import FactNameTaken, FactNotFound
from orbit.events import MEMORY_SET, SpaceEvent
from orbit.limits import MEMORY_KEY_MAX, MEMORY_VALUE_MAX
from orbit.models import Memory, User, new_id
from orbit.services.context import Actor, Env
from orbit.services.notify import KIND_FACT, Activity
from orbit.services.spaces import require_member
from orbit.services.views import FactChange, FactEvent, FactView
from orbit.text import clean_block, clean_single_line

FACT_ADD = "add"
FACT_EDIT = "edit"
FACT_RENAME = "rename"
FACT_DELETE = "delete"


def fact_history(db: Session, space_id: str) -> list[Memory]:
    return list(
        db.scalars(
            select(Memory).where(Memory.space_id == space_id).order_by(Memory.created_at, Memory.id)
        )
    )


def _people(db: Session, user_ids: set[str]) -> dict[str, tuple[str, datetime | None]]:
    if not user_ids:
        return {}
    return {
        user_id: (name, avatar)
        for user_id, name, avatar in db.execute(
            select(User.id, User.display_name, User.avatar_updated_at).where(User.id.in_(user_ids))
        ).all()
    }


def fact_views(db: Session, rows: Sequence[Memory]) -> list[FactView]:
    people = _people(db, {row.set_by for row in rows if row.set_by})
    return [
        FactView(
            key=row.key,
            value=row.value,
            set_by_id=row.set_by,
            set_by_name=people[row.set_by][0] if row.set_by in people else None,
            via=row.via,
            created_at=row.created_at,
            set_by_avatar_updated_at=people[row.set_by][1] if row.set_by in people else None,
        )
        for row in rows
    ]


def current_rows(history: Sequence[Memory]) -> list[Memory]:
    """The live facts, in the order each was first added (a rename keeps its place).

    Deleted facts end in a tombstone that is superseded from the start, so they
    never count as current.
    """
    first_set: dict[str, datetime] = {}
    for row in history:
        first_set.setdefault(row.fact_id, row.created_at)
    current = [row for row in history if row.superseded_at is None]
    current.sort(key=lambda row: (first_set[row.fact_id], row.key.casefold()))
    return current


def current_facts(db: Session, space_id: str) -> list[FactView]:
    return fact_views(db, current_rows(fact_history(db, space_id)))


def _live_rows(db: Session, space_id: str) -> list[Memory]:
    return list(
        db.scalars(
            select(Memory).where(Memory.space_id == space_id, Memory.superseded_at.is_(None))
        )
    )


def _named(rows: Sequence[Memory], key: str) -> Memory | None:
    wanted = key.casefold()
    return next((row for row in rows if row.key.casefold() == wanted), None)


def _require_current(db: Session, space_id: str, key: str) -> Memory:
    clean_key = clean_fact_key(key)
    current = _named(_live_rows(db, space_id), clean_key)
    if current is None:
        raise FactNotFound(f"There is no fact called “{clean_key}”.")
    return current


def clean_fact_key(key: str) -> str:
    return clean_single_line(key, "Key", MEMORY_KEY_MAX)


def clean_fact_value(value: str) -> str:
    return clean_block(value, "Value", MEMORY_VALUE_MAX)


def stage_fact_row(
    db: Session,
    space_id: str,
    user_id: str,
    *,
    fact_id: str,
    action: str,
    key: str,
    value: str,
    via: str,
    created_at: datetime,
    previous_key: str | None = None,
    superseded_at: datetime | None = None,
) -> Memory:
    """Add a fact row (key and value already cleaned) without committing or notifying.

    The one place a Memory row is built: adds, edits, renames, deletes and the
    first facts of a new space all come through here.
    """
    row = Memory(
        id=new_id(),
        space_id=space_id,
        fact_id=fact_id,
        action=action,
        key=key,
        previous_key=previous_key,
        value=value,
        set_by=user_id,
        via=via,
        created_at=created_at,
        superseded_at=superseded_at,
    )
    db.add(row)
    return row


def stage_new_fact(
    db: Session, env: Env, space_id: str, user_id: str, key: str, value: str, via: str
) -> Memory:
    """Add a brand-new fact (its own fact id, an add in its history) without committing."""
    return stage_fact_row(
        db,
        space_id,
        user_id,
        fact_id=new_id(),
        action=FACT_ADD,
        key=clean_fact_key(key),
        value=clean_fact_value(value),
        via=via,
        created_at=env.now(),
    )


def _record_change(db: Session, env: Env, actor: Actor, space_id: str, row: Memory) -> FactView:
    db.commit()
    env.events.publish(SpaceEvent(MEMORY_SET, space_id))
    fact = fact_views(db, [row])[0]
    env.notifier.record(
        db,
        space_id,
        actor.user_id,
        Activity(KIND_FACT, fact.set_by_name or "Someone", actor.via, fact.key, fact.created_at),
    )
    db.commit()
    return fact


def set_fact(
    db: Session, env: Env, actor: Actor, space_id: str, key: str, value: str
) -> FactChange:
    try:
        return _set_fact_once(db, env, actor, space_id, key, value)
    except IntegrityError:
        # Someone else set a fact with this name between our read and our write. Start again,
        # so this time it is an edit of theirs.
        db.rollback()
        return _set_fact_once(db, env, actor, space_id, key, value)


def _set_fact_once(
    db: Session, env: Env, actor: Actor, space_id: str, key: str, value: str
) -> FactChange:
    require_member(db, actor.user_id, space_id)
    clean_key = clean_fact_key(key)
    clean_value = clean_fact_value(value)
    current = _named(_live_rows(db, space_id), clean_key)
    if current is not None and current.value == clean_value:
        return FactChange(fact=fact_views(db, [current])[0], replaced_value=None, changed=False)
    now = env.now()
    replaced_value = None
    stored_key = clean_key
    fact_id = new_id()
    action = FACT_ADD
    if current is not None:
        replaced_value = current.value
        stored_key = current.key
        fact_id = current.fact_id
        action = FACT_EDIT
        current.superseded_at = now
        db.flush()
    row = stage_fact_row(
        db,
        space_id,
        actor.user_id,
        fact_id=fact_id,
        action=action,
        key=stored_key,
        value=clean_value,
        via=actor.via,
        created_at=now,
    )
    fact = _record_change(db, env, actor, space_id, row)
    return FactChange(fact=fact, replaced_value=replaced_value, changed=True)


def rename_fact(
    db: Session, env: Env, actor: Actor, space_id: str, key: str, new_key: str
) -> FactChange:
    require_member(db, actor.user_id, space_id)
    clean_new_key = clean_single_line(new_key, "New name", MEMORY_KEY_MAX)
    current = _require_current(db, space_id, key)
    if current.key == clean_new_key:
        return FactChange(fact=fact_views(db, [current])[0], replaced_value=None, changed=False)
    clash = _named(_live_rows(db, space_id), clean_new_key)
    if clash is not None and clash.id != current.id:
        # Name the fact as the caller typed it: the stored spelling came from another member.
        raise FactNameTaken(f"There is already a fact called “{clean_new_key}”.")
    now = env.now()
    current.superseded_at = now
    db.flush()
    row = stage_fact_row(
        db,
        space_id,
        actor.user_id,
        fact_id=current.fact_id,
        action=FACT_RENAME,
        key=clean_new_key,
        previous_key=current.key,
        value=current.value,
        via=actor.via,
        created_at=now,
    )
    try:
        fact = _record_change(db, env, actor, space_id, row)
    except IntegrityError:
        db.rollback()
        raise FactNameTaken(f"There is already a fact called “{clean_new_key}”.") from None
    return FactChange(fact=fact, replaced_value=None, changed=True)


def delete_fact(db: Session, env: Env, actor: Actor, space_id: str, key: str) -> None:
    require_member(db, actor.user_id, space_id)
    current = _require_current(db, space_id, key)
    now = env.now()
    current.superseded_at = now
    db.flush()
    stage_fact_row(
        db,
        space_id,
        actor.user_id,
        fact_id=current.fact_id,
        action=FACT_DELETE,
        key=current.key,
        value=current.value,
        via=actor.via,
        created_at=now,
        superseded_at=now,
    )
    db.commit()
    env.events.publish(SpaceEvent(MEMORY_SET, space_id))


def fact_events(db: Session, user_id: str, space_id: str, key: str | None) -> list[FactEvent]:
    """Every change to the space's facts, newest first.

    With a key, only the changes to the fact that currently has that name,
    including those made under its earlier names.
    """
    require_member(db, user_id, space_id)
    query = select(Memory).where(Memory.space_id == space_id)
    if key is not None:
        query = query.where(Memory.fact_id == _require_current(db, space_id, key).fact_id)
    rows = list(db.scalars(query.order_by(Memory.created_at, Memory.id)))
    people = _people(db, {row.set_by for row in rows if row.set_by})
    last_value: dict[str, str] = {}
    events: list[FactEvent] = []
    for row in rows:
        person = people.get(row.set_by) if row.set_by else None
        events.append(
            FactEvent(
                action=row.action,
                key=row.key,
                previous_key=row.previous_key if row.action == FACT_RENAME else None,
                value=row.value,
                previous_value=last_value.get(row.fact_id) if row.action == FACT_EDIT else None,
                actor_id=row.set_by,
                actor_name=person[0] if person else None,
                via=row.via,
                at=row.created_at,
                actor_avatar_updated_at=person[1] if person else None,
            )
        )
        last_value[row.fact_id] = row.value
    events.reverse()
    return events
