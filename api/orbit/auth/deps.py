from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from orbit.auth.sessions import SESSION_COOKIE, user_for_session
from orbit.db import session_scope
from orbit.errors import Forbidden, Unauthenticated
from orbit.models import User
from orbit.runtime import Runtime
from orbit.security import rate_limit_address

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def get_runtime(request: Request) -> Runtime:
    runtime: Runtime = request.app.state.runtime
    return runtime


RuntimeDep = Annotated[Runtime, Depends(get_runtime)]


def client_ip(request: Request) -> str:
    return rate_limit_address(request.client.host if request.client else "unknown")


def wants_json(request: Request) -> bool:
    return "application/json" in request.headers.get("accept", "")


def _origin_of(url: str) -> str | None:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def require_same_origin(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    expected = get_runtime(request).settings.base_url
    claimed = request.headers.get("origin")
    if claimed is None:
        referer = request.headers.get("referer")
        claimed = _origin_of(referer) if referer else None
    if claimed != expected:
        raise Forbidden("This request did not come from Orbit.")


def get_db(request: Request) -> Iterator[Session]:
    runtime = get_runtime(request)
    factory = (
        runtime.read_session_factory if request.method in SAFE_METHODS else runtime.session_factory
    )
    with session_scope(factory) as db:
        yield db


DbSession = Annotated[Session, Depends(get_db)]


def optional_user(request: Request) -> User | None:
    runtime = get_runtime(request)
    with session_scope(runtime.read_session_factory) as db:
        return user_for_session(db, runtime.env, request.cookies.get(SESSION_COOKIE))


def session_user(request: Request, db: DbSession) -> User:
    runtime = get_runtime(request)
    user = user_for_session(db, runtime.env, request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise Unauthenticated("Sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(session_user)]


def viewer_of(request: Request, db: Session) -> User | None:
    runtime = get_runtime(request)
    return user_for_session(db, runtime.env, request.cookies.get(SESSION_COOKIE))
