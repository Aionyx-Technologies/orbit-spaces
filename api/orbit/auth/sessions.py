from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from orbit.config import Settings
from orbit.db import rows_affected
from orbit.limits import SESSION_TTL
from orbit.models import User, WebSession
from orbit.security import hash_token, new_token
from orbit.services.context import Env

SESSION_COOKIE = "orbit_session"
OTHER_BROWSER = "Another browser"
BROWSERS = (
    ("Edg/", "Edge"),
    ("EdgA/", "Edge"),
    ("EdgiOS/", "Edge"),
    ("OPR/", "Opera"),
    ("Firefox/", "Firefox"),
    ("FxiOS/", "Firefox"),
    ("CriOS/", "Chrome"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
)


@dataclass(frozen=True)
class LastSignIn:
    at: datetime
    browser: str


def browser_name(user_agent: str | None) -> str:
    text = user_agent or ""
    for marker, name in BROWSERS:
        if marker in text:
            return name
    return OTHER_BROWSER if text.strip() else ""


def create_session(db: Session, env: Env, user_id: str, user_agent: str | None = None) -> str:
    token = new_token()
    now = env.now()
    db.add(
        WebSession(
            token_hash=hash_token(token),
            user_id=user_id,
            expires_at=now + SESSION_TTL,
            created_at=now,
            user_agent=browser_name(user_agent),
        )
    )
    db.commit()
    return token


def user_for_session(db: Session, env: Env, token: str | None) -> User | None:
    if not token:
        return None
    row = db.get(WebSession, hash_token(token))
    if row is None or row.expires_at <= env.now():
        return None
    return db.get(User, row.user_id)


def end_session(db: Session, token: str | None) -> None:
    if not token:
        return
    db.execute(delete(WebSession).where(WebSession.token_hash == hash_token(token)))
    db.commit()


def revoke_all_sessions(db: Session, user_id: str) -> int:
    result = db.execute(delete(WebSession).where(WebSession.user_id == user_id))
    db.commit()
    return rows_affected(result)


def last_sign_in(db: Session, user_id: str, current_token: str | None) -> LastSignIn | None:
    newest_first = (
        select(WebSession.created_at, WebSession.user_agent)
        .where(WebSession.user_id == user_id)
        .order_by(WebSession.created_at.desc())
        .limit(1)
    )
    row = None
    if current_token:
        row = db.execute(
            newest_first.where(WebSession.token_hash != hash_token(current_token))
        ).first()
    if row is None:
        row = db.execute(newest_first).first()
    if row is None:
        return None
    return LastSignIn(at=row[0], browser=row[1])


def set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
