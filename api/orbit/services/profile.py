from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.errors import InvalidInput, NotFound, RateLimited
from orbit.events import PROFILE_CHANGED, SpaceEvent
from orbit.images import process_avatar
from orbit.limits import (
    ABOUT_MAX,
    AVATAR_UPLOADS_PER_USER,
    DISPLAY_NAME_MAX,
    TIME_ZONE_MAX,
)
from orbit.models import Space, SpaceMember, User, UserAvatar
from orbit.services.context import Env
from orbit.services.spaces import require_member
from orbit.text import clean_single_line

EMAIL_FREQUENCIES = ("instant", "daily", "off")
PHOTO_NOT_FOUND = "Photo not found."
PHOTO_RATE_LIMITED = "You have changed your photo as often as allowed today. Try again tomorrow."


@dataclass(frozen=True)
class AvatarFile:
    data: bytes
    updated_at: datetime


def avatar_url(user_id: str, updated_at: datetime | None) -> str | None:
    if updated_at is None:
        return None
    return f"/api/users/{user_id}/avatar?v={int(updated_at.timestamp())}"


def _clean_about(value: str | None) -> str:
    if value is None or not value.strip():
        return ""
    return clean_single_line(value, "About me", ABOUT_MAX)


def _clean_time_zone(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        raise InvalidInput("Choose a time zone.")
    if len(text) > TIME_ZONE_MAX:
        raise InvalidInput("That time zone is not one Orbit knows.")
    try:
        ZoneInfo(text)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise InvalidInput("That time zone is not one Orbit knows.") from exc
    return text


def _clean_frequency(value: str | None) -> str:
    if value not in EMAIL_FREQUENCIES:
        raise InvalidInput("Choose as it happens, a daily summary, or off.")
    return value


def _clean_default_space(db: Session, user_id: str, value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return require_member(db, user_id, value.strip()).id


def update_me(db: Session, user: User, changes: Mapping[str, str | None]) -> User:
    name = (
        clean_single_line(changes["display_name"] or "", "Name", DISPLAY_NAME_MAX)
        if "display_name" in changes
        else user.display_name
    )
    about = _clean_about(changes["about"]) if "about" in changes else user.about
    time_zone = _clean_time_zone(changes["time_zone"]) if "time_zone" in changes else user.time_zone
    frequency = (
        _clean_frequency(changes["email_frequency"])
        if "email_frequency" in changes
        else user.email_frequency
    )
    default_space = (
        _clean_default_space(db, user.id, changes["default_space_id"])
        if "default_space_id" in changes
        else user.default_space_id
    )
    user.display_name = name
    user.about = about
    user.time_zone = time_zone
    user.email_frequency = frequency
    user.default_space_id = default_space
    db.commit()
    return user


def announce_profile_changed(db: Session, env: Env, user_id: str) -> None:
    space_ids = db.scalars(select(SpaceMember.space_id).where(SpaceMember.user_id == user_id)).all()
    for space_id in space_ids:
        env.events.publish(SpaceEvent(PROFILE_CHANGED, space_id, {"user_id": user_id}))


def set_avatar(db: Session, env: Env, user: User, raw: bytes) -> User:
    if not env.limiter.allow(f"avatar:{user.id}", AVATAR_UPLOADS_PER_USER):
        raise RateLimited(PHOTO_RATE_LIMITED)
    image = process_avatar(raw)
    now = env.now()
    existing = db.get(UserAvatar, user.id)
    if existing is None:
        db.add(UserAvatar(user_id=user.id, data=image, updated_at=now))
    else:
        existing.data = image
        existing.updated_at = now
    user.avatar_updated_at = now
    db.commit()
    announce_profile_changed(db, env, user.id)
    return user


def remove_avatar(db: Session, env: Env, user: User) -> User:
    existing = db.get(UserAvatar, user.id)
    if existing is not None:
        db.delete(existing)
    user.avatar_updated_at = None
    db.commit()
    announce_profile_changed(db, env, user.id)
    return user


def shares_a_space(db: Session, first_user_id: str, second_user_id: str) -> bool:
    mine = select(SpaceMember.space_id).where(SpaceMember.user_id == first_user_id)
    shared = db.scalar(
        select(func.count())
        .select_from(SpaceMember)
        .join(Space, Space.id == SpaceMember.space_id)
        .where(
            SpaceMember.user_id == second_user_id,
            SpaceMember.space_id.in_(mine),
            Space.deleted_at.is_(None),
        )
    )
    return bool(shared)


def read_avatar(db: Session, viewer_id: str, owner_id: str) -> AvatarFile:
    if viewer_id != owner_id and not shares_a_space(db, viewer_id, owner_id):
        raise NotFound(PHOTO_NOT_FOUND)
    row = db.get(UserAvatar, owner_id)
    if row is None:
        raise NotFound(PHOTO_NOT_FOUND)
    return AvatarFile(data=row.data, updated_at=row.updated_at)
