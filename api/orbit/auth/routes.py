from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Form, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from orbit.auth.deps import (
    client_ip,
    get_runtime,
    optional_user,
    require_same_origin,
    wants_json,
)
from orbit.auth.magic_links import (
    SignInOutcome,
    consume_sign_in_code,
    consume_sign_in_link,
    join_waitlist,
    peek_sign_in_email,
    request_sign_in_link,
)
from orbit.auth.sessions import (
    SESSION_COOKIE,
    clear_session_cookie,
    create_session,
    end_session,
    set_session_cookie,
)
from orbit.db import session_scope
from orbit.errors import InvalidInput, OrbitError, RateLimited
from orbit.limits import MAGIC_LINK_TTL
from orbit.security import safe_next_path
from orbit.services.demo import DEMO_PEOPLE, DemoPerson
from orbit.templating import page

router = APIRouter(prefix="/auth", tags=["auth"])

NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "same-origin"}


def _context_note(next_path: str) -> str | None:
    if next_path.startswith("/oauth/consent"):
        return "Sign in to finish connecting your assistant."
    if next_path.startswith("/invite/"):
        return "Sign in to join the space you were invited to."
    return None


def _sign_in_page(
    *,
    next_path: str,
    invite: str,
    email: str = "",
    error: str | None = None,
    status_code: int = 200,
    demo_people: Sequence[DemoPerson] = (),
) -> Response:
    return page(
        "pages/sign_in.html",
        status_code=status_code,
        error=error,
        email=email,
        next_path=next_path,
        invite=invite,
        context_note=_context_note(next_path),
        demo_people=demo_people,
        link_minutes=int(MAGIC_LINK_TTL.total_seconds() // 60),
    )


def _demo_people(request: Request) -> Sequence[DemoPerson]:
    return DEMO_PEOPLE if get_runtime(request).settings.demo_mode else ()


def _failure(request: Request, exc: OrbitError, render: Response | None = None) -> Response:
    if wants_json(request) or render is None:
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status
        )
    return render


@router.get("/sign-in")
def sign_in_page(
    request: Request,
    next_path: Annotated[str, Query(alias="next")] = "",
    invite: str = "",
    email: str = "",
) -> Response:
    target = safe_next_path(next_path)
    if optional_user(request) is not None:
        return RedirectResponse(target, status_code=303, headers=NO_STORE)
    return _sign_in_page(
        next_path=target, invite=invite, email=email, demo_people=_demo_people(request)
    )


@router.post("/sign-in")
def sign_in(
    request: Request,
    email: Annotated[str, Form()] = "",
    next_path: Annotated[str, Form(alias="next")] = "",
    invite: Annotated[str, Form()] = "",
) -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    target = safe_next_path(next_path)
    try:
        with session_scope(runtime.session_factory) as db:
            requested = request_sign_in_link(
                db, runtime.env, email, target, invite, client_ip(request)
            )
    except (RateLimited, InvalidInput) as exc:
        rendered = _sign_in_page(
            next_path=target,
            invite=invite,
            email=email,
            error=exc.message,
            status_code=exc.status,
            demo_people=_demo_people(request),
        )
        return _failure(request, exc, rendered)
    if wants_json(request):
        return JSONResponse({"status": requested.outcome.value})
    if requested.outcome is SignInOutcome.PRIVATE_TESTING:
        return page("pages/private_testing.html", status_code=403, email=requested.email)
    return _check_email_page(
        email=requested.email, next_path=target, invite=invite, request_id=requested.request
    )


def _check_email_page(
    *,
    email: str,
    next_path: str,
    invite: str,
    request_id: str | None,
    error: str | None = None,
    status_code: int = 200,
) -> Response:
    return page(
        "pages/check_email.html",
        status_code=status_code,
        email=email,
        next_path=next_path,
        invite=invite,
        request_id=request_id,
        error=error,
        minutes=int(MAGIC_LINK_TTL.total_seconds() // 60),
    )


def _link_failed(next_path: str) -> Response:
    retry = f"/auth/sign-in?next={quote(next_path, safe='')}"
    return page(
        "pages/error.html",
        status_code=400,
        heading="That link did not work",
        message=(
            "Sign-in links work once and expire after 15 minutes. Request a new one to continue."
        ),
        action_href=retry,
        action_label="Get a new link",
    )


@router.get("/verify")
def confirm_sign_in(
    request: Request,
    token: str = "",
    next_path: Annotated[str, Query(alias="next")] = "",
) -> Response:
    target = safe_next_path(next_path)
    runtime = get_runtime(request)
    with session_scope(runtime.read_session_factory) as db:
        email = peek_sign_in_email(db, runtime.env, token)
    if email is None:
        return _link_failed(target)
    return page("pages/confirm_sign_in.html", token=token, next_path=target, email=email)


@router.post("/verify")
def verify(
    request: Request,
    token: Annotated[str, Form()] = "",
    next_path: Annotated[str, Form(alias="next")] = "",
) -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    target = safe_next_path(next_path)
    with session_scope(runtime.session_factory) as db:
        user = consume_sign_in_link(db, runtime.env, token)
        session_token = (
            create_session(db, runtime.env, user.id, request.headers.get("user-agent"))
            if user
            else None
        )
    if session_token is None:
        return _link_failed(target)
    response = RedirectResponse(target, status_code=303, headers=NO_STORE)
    set_session_cookie(response, runtime.settings, session_token)
    return response


@router.post("/code")
def sign_in_with_code(
    request: Request,
    request_id: Annotated[str, Form(alias="request")] = "",
    code: Annotated[str, Form()] = "",
    next_path: Annotated[str, Form(alias="next")] = "",
    invite: Annotated[str, Form()] = "",
) -> Response:
    """Finish signing in with the emailed code, in the window that asked.

    Assistants open sign-in in their own in-app browser, while the emailed
    link opens elsewhere, so the code is the way to sign in that window.
    """
    require_same_origin(request)
    runtime = get_runtime(request)
    target = safe_next_path(next_path)
    try:
        with session_scope(runtime.session_factory) as db:
            check = consume_sign_in_code(db, runtime.env, request_id, code)
            session_token = create_session(db, runtime.env, check.user.id) if check.user else None
    except RateLimited as exc:
        return page(
            "pages/error.html",
            status_code=exc.status,
            heading="Too many attempts",
            message=exc.message,
            action_href=f"/auth/sign-in?next={quote(target, safe='')}",
            action_label="Back to sign in",
        )
    if session_token is not None:
        response = RedirectResponse(target, status_code=303, headers=NO_STORE)
        set_session_cookie(response, runtime.settings, session_token)
        return response
    if check.retry_email is not None:
        return _check_email_page(
            email=check.retry_email,
            next_path=target,
            invite=invite,
            request_id=request_id,
            error="That code did not work. Check it and try again.",
            status_code=400,
        )
    return _code_failed(target)


def _code_failed(next_path: str) -> Response:
    retry = f"/auth/sign-in?next={quote(next_path, safe='')}"
    return page(
        "pages/error.html",
        status_code=400,
        heading="That code did not work",
        message=(
            "Sign-in codes work once, expire after 15 minutes and stop working after a few "
            "wrong tries. Request a new one to continue."
        ),
        action_href=retry,
        action_label="Get a new code",
    )


@router.post("/sign-out")
def sign_out(
    request: Request,
    next_path: Annotated[str, Form(alias="next")] = "",
) -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    with session_scope(runtime.session_factory) as db:
        end_session(db, request.cookies.get(SESSION_COOKIE))
    if wants_json(request):
        response: Response = JSONResponse({"status": "signed_out"})
    elif next_path:
        target = safe_next_path(next_path)
        response = RedirectResponse(
            f"/auth/sign-in?next={quote(target, safe='')}", status_code=303, headers=NO_STORE
        )
    else:
        response = RedirectResponse("/", status_code=303, headers=NO_STORE)
    clear_session_cookie(response, runtime.settings)
    return response


@router.post("/waitlist")
def waitlist(request: Request, email: Annotated[str, Form()] = "") -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    try:
        with session_scope(runtime.session_factory) as db:
            joined = join_waitlist(db, runtime.env, email, client_ip(request))
    except OrbitError as exc:
        rendered = page(
            "pages/error.html",
            status_code=exc.status,
            heading="That did not work",
            message=exc.message,
            action_href="/auth/sign-in",
            action_label="Back to sign in",
        )
        return _failure(request, exc, rendered)
    if wants_json(request):
        return JSONResponse({"status": "joined"})
    return page("pages/waitlist_thanks.html", email=joined)
