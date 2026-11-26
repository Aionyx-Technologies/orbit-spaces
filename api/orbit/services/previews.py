from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.limits import CARD_HIGHLIGHT_VALUE_CHARS, CARD_HIGHLIGHTS, CARD_SOURCES
from orbit.models import Item, Memory, User
from orbit.services.context import (
    AUTHOR_ORBIT,
    KIND_NOTE,
    KIND_PLAN,
    VIA_ORBIT,
    VIA_ORBIT_SUGGESTION,
    VIA_WEB,
)
from orbit.services.memory import current_rows
from orbit.services.views import Highlight, LatestItem, SpacePreview, SpaceView
from orbit.text import truncate

ELLIPSIS = "\N{HORIZONTAL ELLIPSIS}"
UNLISTED_SOURCES = frozenset({VIA_WEB, VIA_ORBIT, VIA_ORBIT_SUGGESTION})


def _later(current: datetime | None, candidate: datetime) -> datetime:
    return candidate if current is None or candidate > current else current


@dataclass
class _ItemTotals:
    note_count: int = 0
    has_plan: bool = False
    newest_at: datetime | None = None
    via_newest: dict[str, datetime] = field(default_factory=dict)

    def add(self, kind: str, via: str, count: int, newest_at: datetime) -> None:
        if kind == KIND_NOTE:
            self.note_count += count
        if kind == KIND_PLAN:
            self.has_plan = True
        self.newest_at = _later(self.newest_at, newest_at)
        self.via_newest[via] = _later(self.via_newest.get(via), newest_at)


def _owner_names(db: Session, spaces: Sequence[SpaceView]) -> dict[str, str]:
    owner_ids = {space.created_by for space in spaces if space.created_by}
    if not owner_ids:
        return {}
    return dict(db.execute(select(User.id, User.display_name).where(User.id.in_(owner_ids))).all())


def _item_totals(db: Session, space_ids: Sequence[str]) -> dict[str, _ItemTotals]:
    totals: dict[str, _ItemTotals] = defaultdict(_ItemTotals)
    rows = db.execute(
        select(Item.space_id, Item.kind, Item.via, func.count(), func.max(Item.created_at))
        .where(Item.space_id.in_(space_ids), Item.retracted_at.is_(None))
        .group_by(Item.space_id, Item.kind, Item.via)
    ).all()
    for space_id, kind, via, count, newest_at in rows:
        totals[space_id].add(kind, via, count, newest_at)
    return totals


def _latest_items(db: Session, space_ids: Sequence[str]) -> dict[str, LatestItem]:
    newest_first = func.row_number().over(
        partition_by=Item.space_id, order_by=(Item.created_at.desc(), Item.id.desc())
    )
    ranked = (
        select(
            Item.space_id,
            Item.title,
            Item.kind,
            Item.via,
            Item.author_kind,
            Item.shared_by,
            Item.created_at,
            newest_first.label("newest_rank"),
        )
        .where(Item.space_id.in_(space_ids), Item.retracted_at.is_(None))
        .subquery()
    )
    rows = db.execute(
        select(
            ranked.c.space_id,
            ranked.c.title,
            ranked.c.kind,
            ranked.c.via,
            ranked.c.author_kind,
            ranked.c.created_at,
            User.display_name,
        )
        .outerjoin(User, User.id == ranked.c.shared_by)
        .where(ranked.c.newest_rank == 1)
    ).all()
    return {
        space_id: LatestItem(
            title=title,
            kind=kind,
            via=via,
            author_kind=author_kind,
            shared_by_name=None if author_kind == AUTHOR_ORBIT else shared_by_name,
            created_at=created_at,
        )
        for space_id, title, kind, via, author_kind, created_at, shared_by_name in rows
    }


def _histories(db: Session, space_ids: Sequence[str]) -> dict[str, list[Memory]]:
    grouped: dict[str, list[Memory]] = defaultdict(list)
    rows = db.scalars(
        select(Memory).where(Memory.space_id.in_(space_ids)).order_by(Memory.created_at, Memory.id)
    )
    for row in rows:
        grouped[row.space_id].append(row)
    return grouped


def _one_line(value: str) -> str:
    shortened, was_cut = truncate(" ".join(value.split()), CARD_HIGHLIGHT_VALUE_CHARS)
    return f"{shortened}{ELLIPSIS}" if was_cut else shortened


def _sources(item_vias: dict[str, datetime], facts: Sequence[Memory]) -> list[str]:
    newest = dict(item_vias)
    for fact in facts:
        newest[fact.via] = _later(newest.get(fact.via), fact.created_at)
    listed = sorted(via for via in newest if via not in UNLISTED_SOURCES)
    listed.sort(key=lambda via: newest[via], reverse=True)
    return listed[:CARD_SOURCES]


def _last_activity(
    space: SpaceView, newest_item_at: datetime | None, history: Sequence[Memory]
) -> datetime:
    moments = [space.created_at, *(row.created_at for row in history)]
    if newest_item_at is not None:
        moments.append(newest_item_at)
    return max(moments)


def _preview(
    space: SpaceView,
    owner_name: str | None,
    totals: _ItemTotals,
    history: Sequence[Memory],
    latest: LatestItem | None,
) -> SpacePreview:
    facts = current_rows(history)
    return SpacePreview(
        owner_name=owner_name,
        last_activity_at=_last_activity(space, totals.newest_at, history),
        note_count=totals.note_count,
        fact_count=len(facts),
        has_plan=totals.has_plan,
        highlights=[
            Highlight(key=fact.key, value=_one_line(fact.value)) for fact in facts[:CARD_HIGHLIGHTS]
        ],
        latest=latest,
        sources=_sources(totals.via_newest, facts),
    )


def preview_spaces(db: Session, spaces: Sequence[SpaceView]) -> dict[str, SpacePreview]:
    if not spaces:
        return {}
    space_ids = [space.id for space in spaces]
    owners = _owner_names(db, spaces)
    totals = _item_totals(db, space_ids)
    latest = _latest_items(db, space_ids)
    histories = _histories(db, space_ids)
    return {
        space.id: _preview(
            space,
            owners.get(space.created_by) if space.created_by else None,
            totals.get(space.id, _ItemTotals()),
            histories.get(space.id, []),
            latest.get(space.id),
        )
        for space in spaces
    }
