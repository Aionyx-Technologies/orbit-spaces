from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Form, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from orbit.auth.deps import get_runtime, require_same_origin
from orbit.auth.sessions import create_session, set_session_cookie
from orbit.db import session_scope
from orbit.errors import NotFound
from orbit.models import User
from orbit.security import safe_next_path
from orbit.services.demo import demo_person, ensure_demo_data

router = APIRouter(prefix="/auth", tags=["demo"])

NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "same-origin"}


@router.post("/demo")
def sign_in_as_demo_person(
    request: Request,
    person: Annotated[str, Form()] = "",
    next_path: Annotated[str, Form(alias="next")] = "",
) -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    chosen = demo_person(person)
    if chosen is None:
        raise NotFound("That demo person does not exist.")
    with session_scope(runtime.session_factory) as db:
        ensure_demo_data(db, runtime.env)
        user = db.scalar(select(User).where(User.email == chosen.email))
        if user is None:
            raise NotFound("That demo person does not exist.")
        token = create_session(db, runtime.env, user.id, request.headers.get("user-agent"))
    response = RedirectResponse(safe_next_path(next_path), status_code=303, headers=NO_STORE)
    set_session_cookie(response, runtime.settings, token)
    return response
