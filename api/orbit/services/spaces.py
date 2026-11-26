from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from orbit.errors import (
    AmbiguousSpace,
    Forbidden,
    InvalidInput,
    LimitReached,
    NotAMember,
    NotFound,
    SpaceNotFound,
)
from orbit.limits import SPACE_NAME_MAX, SPACES_PER_USER, TEMPLATE_FACTS_MAX
from orbit.models import Invite, Item, Memory, Space, SpaceMember, User, new_id
from orbit.services.billing_state import entitlements_for
from orbit.services.context import VIA_ORBIT_SUGGESTION, Actor, Env
from orbit.services.views import MemberView, SpaceView
from orbit.space_templates import (
    GENERAL_ID,
    SpaceTemplate,
    general_template,
    general_template_json,
    read_stored_template,
    template_to_dict,
)
from orbit.text import clean_single_line


def require_member(db: Session, user_id: str, space_id: str) -> Space:
    space = db.get(Space, space_id)
    if space is None or space.deleted_at is not None:
        raise SpaceNotFound("Space not found.")
    if db.get(SpaceMember, (space_id, user_id)) is None:
        raise NotAMember("You are not a member of that space.")
    return space


def member_user_ids(db: Session, space_id: str) -> list[str]:
    return list(db.scalars(select(SpaceMember.user_id).where(SpaceMember.space_id == space_id)))


def count_user_spaces(db: Session, user_id: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(SpaceMember)
            .join(Space, Space.id == SpaceMember.space_id)
            .where(SpaceMember.user_id == user_id, Space.deleted_at.is_(None))
        )
        or 0
    )


def count_created_spaces(db: Session, user_id: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Space)
            .where(Space.created_by == user_id, Space.deleted_at.is_(None))
        )
        or 0
    )


def can_start_space(db: Session, env: Env, user_id: str) -> bool:
    created_cap = entitlements_for(db, env.settings, user_id, env.now()).max_created_spaces
    if created_cap is not None and count_created_spaces(db, user_id) >= created_cap:
        return False
    return count_user_spaces(db, user_id) < SPACES_PER_USER


def count_members(db: Session, space_id: str) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(SpaceMember).where(SpaceMember.space_id == space_id)
        )
        or 0
    )


def _members_by_space(db: Session, space_ids: Sequence[str]) -> dict[str, list[MemberView]]:
    grouped: dict[str, list[MemberView]] = defaultdict(list)
    if not space_ids:
        return grouped
    rows = db.execute(
        select(
            SpaceMember.space_id,
            SpaceMember.user_id,
            SpaceMember.joined_at,
            User.display_name,
            User.about,
            User.avatar_updated_at,
        )
        .join(User, User.id == SpaceMember.user_id)
        .where(SpaceMember.space_id.in_(space_ids))
        .order_by(SpaceMember.joined_at, User.display_name, User.id)
    ).all()
    for space_id, user_id, joined_at, display_name, about, avatar_updated_at in rows:
        grouped[space_id].append(
            MemberView(
                user_id=user_id,
                display_name=display_name,
                joined_at=joined_at,
                about=about,
                avatar_updated_at=avatar_updated_at,
            )
        )
    return grouped


def _to_views(db: Session, spaces: Sequence[Space]) -> list[SpaceView]:
    members = _members_by_space(db, [space.id for space in spaces])
    return [
        SpaceView(
            id=space.id,
            name=space.name,
            created_at=space.created_at,
            created_by=space.created_by,
            members=members.get(space.id, []),
            template=read_stored_template(space.template_id, space.template),
        )
        for space in spaces
    ]


def list_spaces(db: Session, user_id: str) -> list[SpaceView]:
    spaces = db.scalars(
        select(Space)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(SpaceMember.user_id == user_id, Space.deleted_at.is_(None))
        .order_by(Space.created_at.desc(), Space.id)
    ).all()
    return _to_views(db, spaces)


def get_space_view(db: Session, user_id: str, space_id: str) -> SpaceView:
    space = require_member(db, user_id, space_id)
    return _to_views(db, [space])[0]


@dataclass(frozen=True)
class InitialFact:
    key: str
    value: str
    suggested: bool = False


def create_space(
    db: Session,
    env: Env,
    actor: Actor,
    name: str,
    template: SpaceTemplate | None = None,
    facts: Sequence[InitialFact] = (),
) -> SpaceView:
    from orbit.services.memory import clean_fact_key, stage_new_fact

    clean_name = clean_single_line(name, "Space name", SPACE_NAME_MAX)
    if len(facts) > TEMPLATE_FACTS_MAX:
        raise InvalidInput(f"You can set at most {TEMPLATE_FACTS_MAX} facts when creating a space.")
    keys = [clean_fact_key(fact.key).casefold() for fact in facts]
    if len(set(keys)) != len(keys):
        raise InvalidInput("Each fact can only be set once.")
    created_cap = entitlements_for(db, env.settings, actor.user_id, env.now()).max_created_spaces
    if created_cap is not None and count_created_spaces(db, actor.user_id) >= created_cap:
        raise LimitReached(f"You can create up to {created_cap} spaces on the free plan.")
    if count_user_spaces(db, actor.user_id) >= SPACES_PER_USER:
        raise LimitReached(f"You can belong to at most {SPACES_PER_USER} spaces.")
    chosen = template or general_template()
    now = env.now()
    try:
        space = Space(
            id=new_id(),
            name=clean_name,
            created_by=actor.user_id,
            created_at=now,
            template_id=chosen.id,
            template=template_to_dict(chosen),
        )
        db.add(space)
        db.flush()
        db.add(
            SpaceMember(space_id=space.id, user_id=actor.user_id, joined_at=now, notify_email=True)
        )
        for fact in facts:
            via = VIA_ORBIT_SUGGESTION if fact.suggested else actor.via
            stage_new_fact(db, env, space.id, actor.user_id, fact.key, fact.value, via)
        db.commit()
    except Exception:
        db.rollback()
        raise
    view = _to_views(db, [space])[0]
    db.commit()
    return view


@dataclass(frozen=True)
class ResolvedSpace:
    id: str
    name: str | None
    from_default: bool


def resolve_space(db: Session, user_id: str, space_id: str | None) -> ResolvedSpace:
    if space_id and space_id.strip():
        return ResolvedSpace(id=space_id.strip(), name=None, from_default=False)
    spaces = list_spaces(db, user_id)
    default_id = db.scalar(select(User.default_space_id).where(User.id == user_id))
    default = next((space for space in spaces if space.id == default_id), None)
    if default is not None:
        return ResolvedSpace(id=default.id, name=default.name, from_default=True)
    if not spaces:
        raise NotFound("You are not in any Orbit space yet. Create one first.")
    if len(spaces) == 1:
        return ResolvedSpace(id=spaces[0].id, name=spaces[0].name, from_default=False)
    raise AmbiguousSpace(
        "You belong to more than one space. Ask the person which one they mean.",
        [(space.id, space.name) for space in spaces],
    )


def resolve_space_id(db: Session, user_id: str, space_id: str | None) -> str:
    return resolve_space(db, user_id, space_id).id


def clear_default_space(db: Session, space_id: str, user_id: str | None = None) -> None:
    statement = update(User).where(User.default_space_id == space_id)
    if user_id is not None:
        statement = statement.where(User.id == user_id)
    db.execute(statement.values(default_space_id=None))


def notify_flags(db: Session, user_id: str, space_ids: Sequence[str]) -> dict[str, bool]:
    if not space_ids:
        return {}
    rows = db.execute(
        select(SpaceMember.space_id, SpaceMember.notify_email).where(
            SpaceMember.user_id == user_id, SpaceMember.space_id.in_(space_ids)
        )
    ).all()
    return dict(rows)


def set_notify(db: Session, user_id: str, space_id: str, enabled: bool) -> bool:
    require_member(db, user_id, space_id)
    membership = db.get(SpaceMember, (space_id, user_id))
    if membership is None:
        raise NotAMember("You are not a member of that space.")
    membership.notify_email = enabled
    db.commit()
    return enabled


def purge_space(db: Session, space: Space, now: datetime) -> None:
    space.deleted_at = now
    space.name = ""
    space.template_id = GENERAL_ID
    space.template = general_template_json()
    clear_default_space(db, space.id)
    db.execute(delete(Item).where(Item.space_id == space.id))
    db.execute(delete(Memory).where(Memory.space_id == space.id))
    db.execute(delete(Invite).where(Invite.space_id == space.id))
    db.execute(delete(SpaceMember).where(SpaceMember.space_id == space.id))


def delete_space(
    db: Session, env: Env, actor: Actor, space_id: str, confirm_name: str | None = None
) -> None:
    space = require_member(db, actor.user_id, space_id)
    if space.created_by != actor.user_id:
        raise Forbidden("Only the person who created a space can delete it.")
    if confirm_name is not None and confirm_name.strip() != space.name:
        raise InvalidInput(
            "The name does not match this space, so nothing was deleted. Ask the person to type "
            "the space's name exactly as it appears, then try again."
        )
    purge_space(db, space, env.now())
    db.commit()
