from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.errors import Forbidden, InvalidInput, ItemNotFound
from orbit.events import ITEM_ADDED, ITEM_RETRACTED, SpaceEvent
from orbit.limits import CONTENT_MAX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TITLE_MAX
from orbit.models import Item, SpaceMember, User, new_id
from orbit.services.context import KIND_NOTE, Actor, Env
from orbit.services.notify import KIND_ITEM, Activity
from orbit.services.spaces import require_member
from orbit.services.views import ItemsPage, ItemView
from orbit.text import clean_block, clean_single_line


def item_views(db: Session, items: Sequence[Item]) -> list[ItemView]:
    user_ids = {item.shared_by for item in items if item.shared_by}
    people: dict[str, tuple[str, datetime | None]] = {}
    if user_ids:
        people = {
            user_id: (name, avatar)
            for user_id, name, avatar in db.execute(
                select(User.id, User.display_name, User.avatar_updated_at).where(
                    User.id.in_(user_ids)
                )
            ).all()
        }
    return [
        ItemView(
            id=item.id,
            space_id=item.space_id,
            kind=item.kind,
            title=item.title,
            content=item.content,
            author_kind=item.author_kind,
            shared_by_id=item.shared_by,
            shared_by_name=people[item.shared_by][0] if item.shared_by in people else None,
            via=item.via,
            source_item_ids=item.source_item_ids,
            created_at=item.created_at,
            shared_by_avatar_updated_at=(
                people[item.shared_by][1] if item.shared_by in people else None
            ),
        )
        for item in items
    ]


def share_item(
    db: Session, env: Env, actor: Actor, space_id: str, title: str, content: str
) -> ItemView:
    require_member(db, actor.user_id, space_id)
    clean_title = clean_single_line(title, "Title", TITLE_MAX)
    clean_content = clean_block(content, "Content", CONTENT_MAX)
    item = Item(
        id=new_id(),
        space_id=space_id,
        kind=KIND_NOTE,
        title=clean_title,
        content=clean_content,
        author_kind=actor.author_kind,
        shared_by=actor.user_id,
        via=actor.via,
        source_item_ids=None,
        created_at=env.now(),
    )
    db.add(item)
    db.commit()
    env.events.publish(SpaceEvent(ITEM_ADDED, space_id, {"item_id": item.id}))
    view = item_views(db, [item])[0]
    env.notifier.record(
        db,
        space_id,
        actor.user_id,
        Activity(
            KIND_ITEM, view.shared_by_name or "Someone", actor.via, view.title, view.created_at
        ),
    )
    db.commit()
    return view


def list_items(
    db: Session,
    user_id: str,
    space_id: str,
    before: str | None = None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> ItemsPage:
    require_member(db, user_id, space_id)
    page_size = max(1, min(limit, MAX_PAGE_SIZE))
    statement = select(Item).where(Item.space_id == space_id, Item.retracted_at.is_(None))
    if before:
        cursor = db.get(Item, before)
        if cursor is None or cursor.space_id != space_id:
            raise InvalidInput("That page marker is not valid for this space.")
        statement = statement.where(
            sa.or_(
                Item.created_at < cursor.created_at,
                sa.and_(Item.created_at == cursor.created_at, Item.id < cursor.id),
            )
        )
    statement = statement.order_by(Item.created_at.desc(), Item.id.desc()).limit(page_size + 1)
    rows = list(db.scalars(statement))
    has_more = len(rows) > page_size
    rows = rows[:page_size]
    return ItemsPage(
        items=item_views(db, rows),
        next_before=rows[-1].id if has_more and rows else None,
    )


def has_shared_items(db: Session, user_id: str, space_id: str) -> bool:
    return (
        db.scalar(
            select(Item.id)
            .where(
                Item.space_id == space_id,
                Item.shared_by == user_id,
                Item.kind == KIND_NOTE,
                Item.retracted_at.is_(None),
            )
            .limit(1)
        )
        is not None
    )


def latest_plan(db: Session, space_id: str) -> ItemView | None:
    plan = db.scalar(
        select(Item)
        .where(Item.space_id == space_id, Item.kind == "plan", Item.retracted_at.is_(None))
        .order_by(Item.created_at.desc(), Item.id.desc())
        .limit(1)
    )
    return item_views(db, [plan])[0] if plan else None


def recent_notes(db: Session, space_id: str, count: int) -> list[ItemView]:
    rows = db.scalars(
        select(Item)
        .where(Item.space_id == space_id, Item.kind == KIND_NOTE, Item.retracted_at.is_(None))
        .order_by(Item.created_at.desc(), Item.id.desc())
        .limit(count)
    ).all()
    return item_views(db, rows)


def retract_item(db: Session, env: Env, actor: Actor, item_id: str) -> ItemView:
    item = db.get(Item, item_id)
    if item is None or item.retracted_at is not None:
        raise ItemNotFound("Item not found.")
    if db.get(SpaceMember, (item.space_id, actor.user_id)) is None:
        raise ItemNotFound("Item not found.")
    require_member(db, actor.user_id, item.space_id)
    if item.shared_by != actor.user_id:
        raise Forbidden("Only the person who shared an item can retract it.")
    item.retracted_at = env.now()
    item.title = ""
    item.content = ""
    db.commit()
    env.events.publish(SpaceEvent(ITEM_RETRACTED, item.space_id, {"item_id": item.id}))
    view = item_views(db, [item])[0]
    db.commit()
    return view
