from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from orbit.models import (
    BillingAccount,
    CreditGrant,
    Invite,
    Item,
    Memory,
    Space,
    User,
    Waitlist,
    WebSession,
)
from orbit.oauth.connections import list_connections
from orbit.services.billing_state import grant_remaining
from orbit.services.context import Env
from orbit.services.export import export_space
from orbit.services.spaces import list_spaces, notify_flags
from orbit.timeutil import isoformat_z

EXPORT_FORMAT = "orbit-account-export-1"


def _when(value: Any) -> str | None:
    return isoformat_z(value) if value is not None else None


def _account(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "about": user.about,
        "time_zone": user.time_zone,
        "email_frequency": user.email_frequency,
        "default_space_id": user.default_space_id,
        "photo_path": (
            f"/api/users/{user.id}/avatar" if user.avatar_updated_at is not None else None
        ),
        "created_at": _when(user.created_at),
    }


def _sessions(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(WebSession)
        .where(WebSession.user_id == user_id)
        .order_by(WebSession.created_at.desc(), WebSession.token_hash)
    )
    return [
        {
            "browser": row.user_agent,
            "signed_in_at": _when(row.created_at),
            "expires_at": _when(row.expires_at),
        }
        for row in rows
    ]


def _connections(db: Session, env: Env, user_id: str) -> list[dict[str, Any]]:
    return [
        {
            "assistant": view.client_name,
            "returns_to": view.client_host,
            "connected_at": _when(view.connected_at),
        }
        for view in list_connections(db, env, user_id)
    ]


def _spaces(db: Session, env: Env, user_id: str) -> list[dict[str, Any]]:
    views = list_spaces(db, user_id)
    notify = notify_flags(db, user_id, [view.id for view in views])
    exported = []
    for view in views:
        space = export_space(db, env, user_id, view.id)
        space["you"] = {"email_notifications": notify.get(view.id, True)}
        exported.append(space)
    return exported


def _space_names(db: Session, space_ids: set[str]) -> dict[str, str]:
    if not space_ids:
        return {}
    rows = db.execute(select(Space.id, Space.name).where(Space.id.in_(space_ids))).all()
    return dict(rows)


def _items(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(Item)
            .where(Item.shared_by == user_id, Item.retracted_at.is_(None))
            .order_by(Item.created_at, Item.id)
        )
    )
    names = _space_names(db, {row.space_id for row in rows})
    return [
        {
            "id": row.id,
            "space_id": row.space_id,
            "space": names.get(row.space_id, ""),
            "kind": row.kind,
            "title": row.title,
            "content": row.content,
            "via": row.via,
            "created_at": _when(row.created_at),
        }
        for row in rows
    ]


def _facts(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(Memory).where(Memory.set_by == user_id).order_by(Memory.created_at, Memory.id)
        )
    )
    names = _space_names(db, {row.space_id for row in rows})
    return [
        {
            "space_id": row.space_id,
            "space": names.get(row.space_id, ""),
            "action": row.action,
            "key": row.key,
            "previous_key": row.previous_key,
            "value": row.value,
            "via": row.via,
            "created_at": _when(row.created_at),
            "replaced_at": _when(row.superseded_at),
        }
        for row in rows
    ]


def _status(row: Invite, now: Any) -> str:
    if row.accepted_at is not None:
        return "accepted"
    if row.revoked_at is not None:
        return "cancelled"
    return "expired" if row.expires_at <= now else "waiting"


def _invitations_sent(db: Session, env: Env, user_id: str) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(select(Invite).where(Invite.invited_by == user_id).order_by(Invite.expires_at))
    )
    names = _space_names(db, {row.space_id for row in rows})
    now = env.now()
    return [
        {
            "space": names.get(row.space_id, ""),
            "sent_to": row.email,
            "status": _status(row, now),
            "expires_at": _when(row.expires_at),
            "accepted_at": _when(row.accepted_at),
        }
        for row in rows
    ]


def _invitations_received(db: Session, env: Env, user: User) -> list[dict[str, Any]]:
    rows = list(
        db.execute(
            select(Invite, User.display_name)
            .outerjoin(User, User.id == Invite.invited_by)
            .where(Invite.email == user.email)
            .order_by(Invite.expires_at)
        ).all()
    )
    names = _space_names(db, {invite.space_id for invite, _ in rows})
    now = env.now()
    return [
        {
            "space": names.get(invite.space_id, ""),
            "invited_by": inviter,
            "status": _status(invite, now),
            "expires_at": _when(invite.expires_at),
            "accepted_at": _when(invite.accepted_at),
        }
        for invite, inviter in rows
    ]


def _waitlist(db: Session, email: str) -> dict[str, Any] | None:
    row = db.get(Waitlist, email)
    return {"joined_at": _when(row.created_at)} if row is not None else None


def _billing(db: Session, user_id: str) -> dict[str, Any] | None:
    """Plan and credit records, never a Stripe identifier."""
    account = db.get(BillingAccount, user_id)
    grants = list(
        db.scalars(
            select(CreditGrant)
            .where(CreditGrant.user_id == user_id)
            .order_by(CreditGrant.created_at, CreditGrant.id)
        )
    )
    if account is None and not grants:
        return None
    return {
        "plan": account.plan if account is not None else "free",
        "status": account.status if account is not None else "",
        "period_start": _when(account.period_start) if account is not None else None,
        "period_end": _when(account.period_end) if account is not None else None,
        "cancel_at_period_end": account.cancel_at_period_end if account is not None else False,
        "credit_grants": [
            {
                "kind": grant.kind,
                "amount": grant.amount,
                "remaining": grant_remaining(db, grant),
                "expires_at": _when(grant.expires_at),
                "revoked": grant.revoked_at is not None,
                "created_at": _when(grant.created_at),
            }
            for grant in grants
        ],
    }


def export_account(db: Session, env: Env, user: User) -> dict[str, Any]:
    document = _export_account(db, env, user)
    billing = _billing(db, user.id)
    if billing is not None:
        document["billing"] = billing
    return document


def _export_account(db: Session, env: Env, user: User) -> dict[str, Any]:
    return {
        "format": EXPORT_FORMAT,
        "exported_at": _when(env.now()),
        "account": _account(user),
        "spaces": _spaces(db, env, user.id),
        "things_you_shared": _items(db, user.id),
        "facts_you_set": _facts(db, user.id),
        "invitations_you_sent": _invitations_sent(db, env, user.id),
        "invitations_sent_to_you": _invitations_received(db, env, user),
        "connected_assistants": _connections(db, env, user.id),
        "browser_sessions": _sessions(db, user.id),
        "waitlist": _waitlist(db, user.email),
        "not_included": [
            "Sign-in links and codes, session and access tokens, which are stored only as hashes.",
            "What other people shared, beyond the spaces you belong to.",
        ],
    }
