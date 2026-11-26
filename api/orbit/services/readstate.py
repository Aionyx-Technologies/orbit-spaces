from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from orbit.limits import NEW_LIST_MAX
from orbit.models import Item, Memory, SpaceMember
from orbit.services.context import KIND_PLAN
from orbit.services.items import item_views
from orbit.services.memory import fact_views
from orbit.services.spaces import require_member
from orbit.services.views import NewActivity


def _written_by_someone_else(
    author: InstrumentedAttribute[str | None], user_id: str
) -> sa.ColumnElement[bool]:
    return sa.or_(author.is_(None), author != user_id)


def _new_item_conditions(
    user_id: str, space_id: str, since: datetime
) -> list[sa.ColumnElement[bool]]:
    return [
        Item.space_id == space_id,
        Item.retracted_at.is_(None),
        Item.created_at > since,
        _written_by_someone_else(Item.shared_by, user_id),
    ]


def _new_fact_conditions(
    user_id: str, space_id: str, since: datetime
) -> list[sa.ColumnElement[bool]]:
    return [
        Memory.space_id == space_id,
        Memory.superseded_at.is_(None),
        Memory.created_at > since,
        _written_by_someone_else(Memory.set_by, user_id),
    ]


def last_read_at(db: Session, user_id: str, space_id: str) -> datetime | None:
    return db.scalar(
        select(SpaceMember.last_read_at).where(
            SpaceMember.space_id == space_id, SpaceMember.user_id == user_id
        )
    )


def _is_mine(space_column: InstrumentedAttribute[str], user_id: str) -> sa.ColumnElement[bool]:
    return sa.and_(SpaceMember.space_id == space_column, SpaceMember.user_id == user_id)


def new_counts(db: Session, user_id: str, space_ids: Sequence[str]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    if not space_ids:
        return totals
    items = (
        select(Item.space_id, func.count())
        .join(SpaceMember, _is_mine(Item.space_id, user_id))
        .where(
            Item.space_id.in_(space_ids),
            Item.retracted_at.is_(None),
            SpaceMember.last_read_at.is_not(None),
            Item.created_at > SpaceMember.last_read_at,
            _written_by_someone_else(Item.shared_by, user_id),
        )
        .group_by(Item.space_id)
    )
    facts = (
        select(Memory.space_id, func.count())
        .join(SpaceMember, _is_mine(Memory.space_id, user_id))
        .where(
            Memory.space_id.in_(space_ids),
            Memory.superseded_at.is_(None),
            SpaceMember.last_read_at.is_not(None),
            Memory.created_at > SpaceMember.last_read_at,
            _written_by_someone_else(Memory.set_by, user_id),
        )
        .group_by(Memory.space_id)
    )
    for statement in (items, facts):
        for space_id, count in db.execute(statement).all():
            totals[space_id] += count
    return totals


def new_activity(db: Session, user_id: str, space_id: str, since: datetime | None) -> NewActivity:
    if since is None:
        return NewActivity(first_look=True, facts=[], items=[], plans=[])
    item_conditions = _new_item_conditions(user_id, space_id, since)
    fact_conditions = _new_fact_conditions(user_id, space_id, since)
    item_rows = list(
        db.scalars(
            select(Item)
            .where(*item_conditions)
            .order_by(Item.created_at.desc(), Item.id.desc())
            .limit(NEW_LIST_MAX)
        )
    )
    fact_rows = list(
        db.scalars(
            select(Memory)
            .where(*fact_conditions)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(NEW_LIST_MAX)
        )
    )
    item_total = db.scalar(select(func.count()).select_from(Item).where(*item_conditions)) or 0
    fact_total = db.scalar(select(func.count()).select_from(Memory).where(*fact_conditions)) or 0
    views = item_views(db, item_rows)
    return NewActivity(
        first_look=False,
        facts=fact_views(db, fact_rows),
        items=[view for view in views if view.kind != KIND_PLAN],
        plans=[view for view in views if view.kind == KIND_PLAN],
        omitted=(item_total - len(item_rows)) + (fact_total - len(fact_rows)),
    )


def mark_read(db: Session, user_id: str, space_id: str, now: datetime) -> None:
    require_member(db, user_id, space_id)
    membership = db.get(SpaceMember, (space_id, user_id))
    if membership is None:
        return
    if membership.last_read_at is None or membership.last_read_at < now:
        membership.last_read_at = now
    db.commit()
