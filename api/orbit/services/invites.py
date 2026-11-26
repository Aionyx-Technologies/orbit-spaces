from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import ColumnElement, exists, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from orbit.db import rows_affected
from orbit.errors import InviteNotFound, InviteUnusable, LimitReached, NotFound, RateLimited
from orbit.events import INVITES_CHANGED, MEMBER_JOINED, SpaceEvent
from orbit.limits import (
    EXPIRED_INVITES_SHOWN_FOR,
    INVITE_EMAILS_PER_USER,
    INVITE_TTL,
    SPACES_PER_USER,
)
from orbit.mail_templates import invite_message
from orbit.models import Invite, Space, SpaceMember, User, UserAvatar
from orbit.security import hash_token, new_token, normalize_email
from orbit.services.billing_state import members_cap
from orbit.services.context import Actor, Env
from orbit.services.notify import notify_invite_accepted
from orbit.services.profile import PHOTO_NOT_FOUND, AvatarFile
from orbit.services.spaces import count_members, count_user_spaces, require_member

InviteStatusValue = Literal["valid", "expired", "used", "revoked"]
WaitingStatus = Literal["pending", "expired"]

UNUSABLE_MESSAGES = {
    "expired": "This invite has expired. Ask for a new one.",
    "used": "This invite was already used. Ask for a new one.",
    "revoked": "This invite is no longer valid. Ask for a new one.",
}
NOT_WAITING = "That invite is no longer waiting. It may have been accepted or cancelled."


@dataclass(frozen=True)
class InviteCreated:
    url: str
    expires_at: datetime
    emailed: bool


@dataclass(frozen=True)
class InviteView:
    status: InviteStatusValue
    space_id: str
    space_name: str
    invited_by: str | None
    expires_at: datetime
    signed_in: bool
    already_member: bool
    inviter_avatar_updated_at: datetime | None = None


@dataclass(frozen=True)
class AcceptResult:
    space_id: str
    already_member: bool


@dataclass(frozen=True)
class PendingInvitation:
    id: str
    space_name: str
    invited_by: str | None
    invited_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class WaitingInvite:
    id: str
    email: str
    invited_by: str | None
    invited_at: datetime
    expires_at: datetime
    status: WaitingStatus


def invitation_id(token_hash: str) -> str:
    return hashlib.sha256(b"invitation:" + token_hash.encode()).hexdigest()[:32]


def _status_of(invite: Invite, now: datetime) -> InviteStatusValue:
    if invite.accepted_at is not None:
        return "used"
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= now:
        return "expired"
    return "valid"


def _open_conditions(now: datetime) -> tuple[ColumnElement[bool], ...]:
    return (
        Invite.accepted_at.is_(None),
        Invite.revoked_at.is_(None),
        Invite.expires_at > now,
    )


def _with_live_space(db: Session, invite: Invite | None) -> tuple[Invite, Space]:
    space = db.get(Space, invite.space_id) if invite else None
    if invite is None or space is None or space.deleted_at is not None:
        raise InviteNotFound("This invite is not valid.")
    return invite, space


def _load(db: Session, token: str) -> tuple[Invite, Space]:
    invite = db.get(Invite, hash_token(token)) if token else None
    return _with_live_space(db, invite)


def _load_addressed(db: Session, user: User, wanted_id: str) -> tuple[Invite, Space]:
    addressed = db.scalars(select(Invite).where(Invite.email == normalize_email(user.email)))
    invite = next((row for row in addressed if invitation_id(row.token_hash) == wanted_id), None)
    return _with_live_space(db, invite)


def find_usable_invite(
    db: Session, env: Env, token: str, for_email: str | None = None
) -> Invite | None:
    try:
        invite, _space = _load(db, token)
    except InviteNotFound:
        return None
    if _status_of(invite, env.now()) != "valid":
        return None
    if for_email is not None and invite.email is not None and invite.email != for_email:
        return None
    return invite


def create_invite(
    db: Session, env: Env, actor: Actor, space_id: str, raw_email: str | None
) -> InviteCreated:
    space = require_member(db, actor.user_id, space_id)
    cap = members_cap(db, env.settings, space, env.now())
    if count_members(db, space_id) >= cap:
        raise LimitReached(f"This space already has {cap} people.")
    email = normalize_email(raw_email) if raw_email and raw_email.strip() else None
    if email and not env.limiter.allow(f"invite-email:{actor.user_id}", INVITE_EMAILS_PER_USER):
        raise RateLimited("You have sent a lot of invites. Please wait a while and try again.")
    token = new_token()
    expires_at = env.now() + INVITE_TTL
    db.add(
        Invite(
            token_hash=hash_token(token),
            space_id=space_id,
            invited_by=actor.user_id,
            email=email,
            expires_at=expires_at,
            accepted_by=None,
            accepted_at=None,
            revoked_at=None,
        )
    )
    inviter = db.get(User, actor.user_id)
    inviter_name = inviter.display_name if inviter else "Someone"
    db.commit()
    url = f"{env.settings.base_url}/invite/{token}"
    if email:
        photo = None
        if inviter is not None and inviter.avatar_updated_at is not None:
            version = int(inviter.avatar_updated_at.timestamp())
            photo = f"{env.settings.base_url}/api/invites/{token}/inviter-avatar?v={version}"
        env.mailer.enqueue(
            invite_message(email, inviter_name, space.name, url, INVITE_TTL.days, photo)
        )
    if email:
        env.events.publish(SpaceEvent(INVITES_CHANGED, space_id))
    return InviteCreated(url=url, expires_at=expires_at, emailed=email is not None)


def get_invite_view(db: Session, env: Env, token: str, viewer_id: str | None) -> InviteView:
    invite, space = _load(db, token)
    inviter = db.get(User, invite.invited_by) if invite.invited_by else None
    already_member = bool(viewer_id and db.get(SpaceMember, (space.id, viewer_id)) is not None)
    return InviteView(
        status=_status_of(invite, env.now()),
        space_id=space.id,
        space_name=space.name,
        invited_by=inviter.display_name if inviter else None,
        expires_at=invite.expires_at,
        signed_in=viewer_id is not None,
        already_member=already_member,
        inviter_avatar_updated_at=inviter.avatar_updated_at if inviter else None,
    )


def read_inviter_avatar(db: Session, env: Env, token: str) -> AvatarFile:
    invite, _space = _load(db, token)
    if _status_of(invite, env.now()) != "valid" or invite.invited_by is None:
        raise NotFound(PHOTO_NOT_FOUND)
    row = db.get(UserAvatar, invite.invited_by)
    if row is None:
        raise NotFound(PHOTO_NOT_FOUND)
    return AvatarFile(data=row.data, updated_at=row.updated_at)


def _pending_conditions(user: User, now: datetime) -> tuple[ColumnElement[bool], ...]:
    """Open invites addressed to this person, to live spaces they have not joined.

    Callers must join Space on Invite.space_id.
    """
    already_in_space = exists().where(
        SpaceMember.space_id == Invite.space_id, SpaceMember.user_id == user.id
    )
    return (
        Invite.email == normalize_email(user.email),
        *_open_conditions(now),
        Space.deleted_at.is_(None),
        ~already_in_space,
    )


def count_pending_invitations(db: Session, env: Env, user: User) -> int:
    count = db.scalar(
        select(func.count())
        .select_from(Invite)
        .join(Space, Space.id == Invite.space_id)
        .where(*_pending_conditions(user, env.now()))
    )
    return count or 0


def list_pending_invitations(db: Session, env: Env, user: User) -> list[PendingInvitation]:
    rows = db.execute(
        select(Invite.token_hash, Invite.expires_at, Space.name, User.display_name)
        .select_from(Invite)
        .join(Space, Space.id == Invite.space_id)
        .outerjoin(User, User.id == Invite.invited_by)
        .where(*_pending_conditions(user, env.now()))
        .order_by(Invite.expires_at.desc(), Invite.token_hash)
    ).all()
    return [
        PendingInvitation(
            id=invitation_id(token_hash),
            space_name=space_name,
            invited_by=inviter_name,
            invited_at=expires_at - INVITE_TTL,
            expires_at=expires_at,
        )
        for token_hash, expires_at, space_name, inviter_name in rows
    ]


def _is_member(db: Session, space_id: str, user_id: str) -> bool:
    return db.get(SpaceMember, (space_id, user_id)) is not None


def _accept(db: Session, env: Env, user_id: str, invite: Invite, space: Space) -> AcceptResult:
    if _is_member(db, space.id, user_id):
        return AcceptResult(space_id=space.id, already_member=True)
    now = env.now()
    status = _status_of(invite, now)
    if status != "valid":
        raise InviteUnusable(UNUSABLE_MESSAGES[status])
    cap = members_cap(db, env.settings, space, now)
    if count_members(db, space.id) >= cap:
        raise LimitReached(f"This space is full. It already has {cap} people.")
    if count_user_spaces(db, user_id) >= SPACES_PER_USER:
        raise LimitReached(f"You can belong to at most {SPACES_PER_USER} spaces.")
    claimed = db.execute(
        update(Invite)
        .where(Invite.token_hash == invite.token_hash, *_open_conditions(now))
        .values(accepted_by=user_id, accepted_at=now)
    )
    if rows_affected(claimed) != 1:
        db.rollback()
        raise InviteUnusable(UNUSABLE_MESSAGES["used"])
    db.add(SpaceMember(space_id=space.id, user_id=user_id, joined_at=now, notify_email=True))
    try:
        db.commit()
    except IntegrityError:
        # A second invite to the same space was accepted at the same moment.
        db.rollback()
        return AcceptResult(space_id=space.id, already_member=True)
    env.events.publish(SpaceEvent(MEMBER_JOINED, space.id, {"user_id": user_id}))
    notify_invite_accepted(db, env.mailer, env.settings, space, invite.invited_by, user_id)
    db.commit()
    return AcceptResult(space_id=space.id, already_member=False)


def accept_invite(db: Session, env: Env, user_id: str, token: str) -> AcceptResult:
    invite, space = _load(db, token)
    return _accept(db, env, user_id, invite, space)


def accept_invitation(db: Session, env: Env, user: User, wanted_id: str) -> AcceptResult:
    invite, space = _load_addressed(db, user, wanted_id)
    return _accept(db, env, user.id, invite, space)


def decline_invitation(db: Session, env: Env, user: User, wanted_id: str) -> None:
    invite, _space = _load_addressed(db, user, wanted_id)
    now = env.now()
    declined = db.execute(
        update(Invite)
        .where(Invite.token_hash == invite.token_hash, *_open_conditions(now))
        .values(revoked_at=now)
    )
    if rows_affected(declined) == 1:
        db.commit()
        return
    db.refresh(invite)
    used = invite.accepted_at is not None
    db.rollback()
    if used:
        raise InviteUnusable(UNUSABLE_MESSAGES["used"])


def _waiting_conditions(space_id: str, now: datetime) -> tuple[ColumnElement[bool], ...]:
    member = aliased(User)
    already_joined = (
        exists()
        .where(SpaceMember.space_id == space_id, SpaceMember.user_id == member.id)
        .where(member.email == Invite.email)
    )
    return (
        Invite.space_id == space_id,
        Invite.email.is_not(None),
        Invite.accepted_at.is_(None),
        Invite.revoked_at.is_(None),
        Invite.expires_at > now - EXPIRED_INVITES_SHOWN_FOR,
        ~already_joined,
    )


def list_waiting_invites(db: Session, env: Env, user_id: str, space_id: str) -> list[WaitingInvite]:
    """Email invites to this space that nobody has accepted or cancelled, newest per address."""
    require_member(db, user_id, space_id)
    now = env.now()
    inviter = aliased(User)
    rows = db.execute(
        select(Invite.token_hash, Invite.email, Invite.expires_at, inviter.display_name)
        .select_from(Invite)
        .outerjoin(inviter, inviter.id == Invite.invited_by)
        .where(*_waiting_conditions(space_id, now))
        .order_by(Invite.expires_at.desc(), Invite.token_hash)
    ).all()
    waiting: dict[str, WaitingInvite] = {}
    for token_hash, email, expires_at, inviter_name in rows:
        if email is None or email in waiting:
            continue
        waiting[email] = WaitingInvite(
            id=invitation_id(token_hash),
            email=email,
            invited_by=inviter_name,
            invited_at=expires_at - INVITE_TTL,
            expires_at=expires_at,
            status="pending" if expires_at > now else "expired",
        )
    return list(waiting.values())


def _load_waiting(db: Session, env: Env, space_id: str, wanted_id: str) -> Invite:
    candidates = db.scalars(select(Invite).where(*_waiting_conditions(space_id, env.now())))
    invite = next((row for row in candidates if invitation_id(row.token_hash) == wanted_id), None)
    if invite is None:
        raise InviteNotFound(NOT_WAITING)
    return invite


def _cancel(db: Session, token_hash: str, now: datetime) -> None:
    db.execute(
        update(Invite)
        .where(
            Invite.token_hash == token_hash,
            Invite.accepted_at.is_(None),
            Invite.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )


def resend_invite(
    db: Session, env: Env, actor: Actor, space_id: str, wanted_id: str
) -> InviteCreated:
    """Email a fresh invite to the same address and cancel the old one.

    Links are stored only as a hash, so the original link cannot be sent again.
    """
    require_member(db, actor.user_id, space_id)
    old = _load_waiting(db, env, space_id, wanted_id)
    old_hash = old.token_hash
    created = create_invite(db, env, actor, space_id, old.email)
    _cancel(db, old_hash, env.now())
    db.commit()
    return created


def cancel_invite(db: Session, env: Env, actor: Actor, space_id: str, wanted_id: str) -> None:
    require_member(db, actor.user_id, space_id)
    invite = _load_waiting(db, env, space_id, wanted_id)
    _cancel(db, invite.token_hash, env.now())
    db.commit()
    env.events.publish(SpaceEvent(INVITES_CHANGED, space_id))
