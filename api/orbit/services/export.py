from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.models import Item, Memory, User
from orbit.services.context import Env
from orbit.services.memory import fact_history
from orbit.services.spaces import get_space_view
from orbit.space_templates import template_to_dict
from orbit.timeutil import isoformat_z


def _names(db: Session, user_ids: set[str | None]) -> dict[str, str]:
    wanted = {user_id for user_id in user_ids if user_id}
    if not wanted:
        return {}
    return dict(db.execute(select(User.id, User.display_name).where(User.id.in_(wanted))).all())


def _history_entry(row: Memory, names: dict[str, str]) -> dict[str, Any]:
    return {
        "action": row.action,
        "key": row.key,
        "previous_key": row.previous_key,
        "value": row.value,
        "set_by": names.get(row.set_by) if row.set_by else None,
        "via": row.via,
        "created_at": isoformat_z(row.created_at),
        "superseded_at": isoformat_z(row.superseded_at) if row.superseded_at else None,
    }


def _item_entry(row: Item, names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": row.id,
        "kind": row.kind,
        "title": row.title,
        "content": row.content,
        "author_kind": row.author_kind,
        "shared_by": names.get(row.shared_by) if row.shared_by else None,
        "via": row.via,
        "created_at": isoformat_z(row.created_at),
        "source_item_ids": row.source_item_ids,
    }


def export_space(db: Session, env: Env, user_id: str, space_id: str) -> dict[str, Any]:
    space = get_space_view(db, user_id, space_id)
    history = fact_history(db, space_id)
    items = list(
        db.scalars(
            select(Item)
            .where(Item.space_id == space_id, Item.retracted_at.is_(None))
            .order_by(Item.created_at, Item.id)
        )
    )
    names = _names(db, {row.set_by for row in history} | {row.shared_by for row in items})
    entries = [_history_entry(row, names) for row in history]
    return {
        "exported_at": isoformat_z(env.now()),
        "space": {"id": space.id, "name": space.name, "created_at": isoformat_z(space.created_at)},
        "template": template_to_dict(space.template),
        "members": [
            {"display_name": member.display_name, "joined_at": isoformat_z(member.joined_at)}
            for member in space.members
        ],
        "memory": {
            "current": [entry for entry in entries if entry["superseded_at"] is None],
            "history": entries,
        },
        "items": [_item_entry(row, names) for row in items],
    }
