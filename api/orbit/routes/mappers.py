from __future__ import annotations

from datetime import datetime

from orbit import schemas
from orbit.services.context import AUTHOR_ORBIT, KIND_NOTE
from orbit.services.profile import avatar_url
from orbit.services.views import (
    FactEvent,
    FactView,
    Highlight,
    ItemView,
    LatestItem,
    MemberView,
    SpacePreview,
    SpaceView,
)
from orbit.space_templates import SpaceTemplate, TemplateFact


def _author_kind(value: str) -> schemas.AuthorKind:
    if value == "person":
        return "person"
    if value == "assistant":
        return "assistant"
    return "orbit"


def person_out(
    user_id: str | None, display_name: str | None, avatar_updated_at: datetime | None = None
) -> schemas.PersonOut:
    return schemas.PersonOut(
        user_id=user_id,
        display_name=display_name,
        avatar_url=avatar_url(user_id, avatar_updated_at) if user_id else None,
    )


def member_out(member: MemberView, me: str) -> schemas.MemberOut:
    return schemas.MemberOut(
        user_id=member.user_id,
        display_name=member.display_name,
        joined_at=member.joined_at,
        is_you=member.user_id == me,
        about=member.about,
        avatar_url=avatar_url(member.user_id, member.avatar_updated_at),
    )


def highlight_out(highlight: Highlight) -> schemas.HighlightOut:
    return schemas.HighlightOut(key=highlight.key, value=highlight.value)


def latest_item_out(latest: LatestItem) -> schemas.LatestItemOut:
    return schemas.LatestItemOut(
        title=latest.title,
        kind="note" if latest.kind == KIND_NOTE else "plan",
        via=latest.via,
        author_kind=_author_kind(latest.author_kind),
        shared_by_name=latest.shared_by_name,
        created_at=latest.created_at,
    )


def space_summary_out(
    space: SpaceView, me: str, notify_email: bool, preview: SpacePreview, new_count: int
) -> schemas.SpaceSummaryOut:
    return schemas.SpaceSummaryOut(
        id=space.id,
        name=space.name,
        created_at=space.created_at,
        is_creator=space.created_by == me,
        notify_email=notify_email,
        members=[member_out(member, me) for member in space.members],
        owner_name=preview.owner_name,
        last_activity_at=preview.last_activity_at,
        note_count=preview.note_count,
        fact_count=preview.fact_count,
        has_plan=preview.has_plan,
        highlights=[highlight_out(highlight) for highlight in preview.highlights],
        latest=latest_item_out(preview.latest) if preview.latest else None,
        sources=list(preview.sources),
        new_count=new_count,
    )


def template_fact_out(fact: TemplateFact) -> schemas.TemplateFactOut:
    return schemas.TemplateFactOut(key=fact.key, hint=fact.hint)


def template_out(template: SpaceTemplate) -> schemas.TemplateOut:
    return schemas.TemplateOut(
        id=template.id,
        name=template.name,
        description=template.description,
        facts=[template_fact_out(fact) for fact in template.facts],
        plan_sections=list(template.plan_sections),
        combine_hint=template.combine_hint,
        tips=list(template.tips),
        icon=template.icon,
    )


def fact_out(fact: FactView) -> schemas.FactOut:
    return schemas.FactOut(
        key=fact.key,
        value=fact.value,
        set_by=person_out(fact.set_by_id, fact.set_by_name, fact.set_by_avatar_updated_at),
        via=fact.via,
        created_at=fact.created_at,
    )


def _fact_action(value: str) -> schemas.FactAction:
    if value == "edit":
        return "edit"
    if value == "rename":
        return "rename"
    if value == "delete":
        return "delete"
    return "add"


def fact_event_out(event: FactEvent) -> schemas.FactEventOut:
    return schemas.FactEventOut(
        action=_fact_action(event.action),
        key=event.key,
        previous_key=event.previous_key,
        value=event.value,
        previous_value=event.previous_value,
        by=person_out(event.actor_id, event.actor_name, event.actor_avatar_updated_at)
        if event.actor_id
        else None,
        via=event.via,
        at=event.at,
    )


def item_out(item: ItemView, me: str) -> schemas.ItemOut:
    by_orbit = item.author_kind == AUTHOR_ORBIT
    return schemas.ItemOut(
        id=item.id,
        space_id=item.space_id,
        kind="note" if item.kind == KIND_NOTE else "plan",
        title=item.title,
        content=item.content,
        author_kind=_author_kind(item.author_kind),
        shared_by=None
        if by_orbit
        else person_out(item.shared_by_id, item.shared_by_name, item.shared_by_avatar_updated_at),
        via=item.via,
        created_at=item.created_at,
        source_item_ids=item.source_item_ids,
        can_retract=item.kind == KIND_NOTE and item.shared_by_id == me,
    )
