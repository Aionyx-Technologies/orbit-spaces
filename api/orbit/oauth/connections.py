from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from orbit import models
from orbit.errors import NotFound
from orbit.oauth.redirects import redirect_host
from orbit.security import hash_token
from orbit.services.context import Env


@dataclass(frozen=True)
class ConnectionView:
    id: str
    client_name: str
    client_host: str
    connected_at: datetime


def connection_id(client_id: str) -> str:
    return hash_token(f"connection:{client_id}")[:16]


def _active_clients(db: Session, user_id: str, now: datetime) -> dict[str, datetime]:
    rows = db.execute(
        select(models.OAuthToken.client_id, func.min(models.OAuthToken.created_at))
        .where(
            models.OAuthToken.user_id == user_id,
            models.OAuthToken.revoked_at.is_(None),
            models.OAuthToken.refresh_expires_at > now,
        )
        .group_by(models.OAuthToken.client_id)
    ).all()
    return dict(rows)


def list_connections(db: Session, env: Env, user_id: str) -> list[ConnectionView]:
    active = _active_clients(db, user_id, env.now())
    if not active:
        return []
    clients = db.scalars(
        select(models.OAuthClient).where(models.OAuthClient.client_id.in_(list(active)))
    ).all()
    views = [
        ConnectionView(
            id=connection_id(client.client_id),
            client_name=client.client_name,
            client_host=redirect_host(client.redirect_uris),
            connected_at=active[client.client_id],
        )
        for client in clients
    ]
    return sorted(views, key=lambda view: (view.connected_at, view.client_name), reverse=True)


def revoke_connection(db: Session, env: Env, user_id: str, wanted_id: str) -> None:
    now = env.now()
    matching = [
        client_id
        for client_id in _active_clients(db, user_id, now)
        if connection_id(client_id) == wanted_id
    ]
    if not matching:
        raise NotFound("Connection not found.")
    db.execute(
        update(models.OAuthToken)
        .where(
            models.OAuthToken.user_id == user_id,
            models.OAuthToken.client_id.in_(matching),
            models.OAuthToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    db.execute(
        update(models.OAuthCode)
        .where(
            models.OAuthCode.user_id == user_id,
            models.OAuthCode.client_id.in_(matching),
            models.OAuthCode.used_at.is_(None),
        )
        .values(used_at=now)
    )
    db.commit()
