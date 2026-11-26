from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from orbit.space_templates import SpaceTemplate, TemplateFact


@dataclass(frozen=True)
class MemberView:
    user_id: str
    display_name: str
    joined_at: datetime
    about: str = ""
    avatar_updated_at: datetime | None = None


@dataclass(frozen=True)
class SpaceView:
    id: str
    name: str
    created_at: datetime
    created_by: str | None
    members: list[MemberView]
    template: SpaceTemplate


@dataclass(frozen=True)
class Highlight:
    key: str
    value: str


@dataclass(frozen=True)
class LatestItem:
    title: str
    kind: str
    via: str
    author_kind: str
    shared_by_name: str | None
    created_at: datetime


@dataclass(frozen=True)
class SpacePreview:
    owner_name: str | None
    last_activity_at: datetime
    note_count: int
    fact_count: int
    has_plan: bool
    highlights: list[Highlight]
    latest: LatestItem | None
    sources: list[str]


@dataclass(frozen=True)
class FactView:
    key: str
    value: str
    set_by_id: str | None
    set_by_name: str | None
    via: str
    created_at: datetime
    set_by_avatar_updated_at: datetime | None = None


@dataclass(frozen=True)
class FactEvent:
    action: str
    key: str
    previous_key: str | None
    value: str
    previous_value: str | None
    actor_id: str | None
    actor_name: str | None
    via: str
    at: datetime
    actor_avatar_updated_at: datetime | None = None


@dataclass(frozen=True)
class FactChange:
    fact: FactView
    replaced_value: str | None
    changed: bool


@dataclass(frozen=True)
class ItemView:
    id: str
    space_id: str
    kind: str
    title: str
    content: str
    author_kind: str
    shared_by_id: str | None
    shared_by_name: str | None
    via: str
    source_item_ids: list[str] | None
    created_at: datetime
    shared_by_avatar_updated_at: datetime | None = None


@dataclass(frozen=True)
class ItemsPage:
    items: list[ItemView]
    next_before: str | None


@dataclass(frozen=True)
class NewActivity:
    first_look: bool
    facts: list[FactView]
    items: list[ItemView]
    plans: list[ItemView]
    omitted: int = 0

    @property
    def total(self) -> int:
        return len(self.facts) + len(self.items) + len(self.plans) + self.omitted


@dataclass(frozen=True)
class SpaceDetail:
    space: SpaceView
    facts: list[FactView]
    unset_facts: list[TemplateFact]
    latest_plan: ItemView | None


@dataclass(frozen=True)
class SpaceContext:
    space: SpaceView
    facts: list[FactView]
    unset_facts: list[TemplateFact]
    recent_items: list[ItemView]
    latest_plan: ItemView | None
    new: NewActivity
    has_own_items: bool
