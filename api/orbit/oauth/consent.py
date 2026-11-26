from __future__ import annotations

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Form, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from mcp.server.auth.provider import construct_redirect_uri

from orbit.auth.deps import get_runtime, optional_user, require_same_origin
from orbit.limits import CONSENT_REQUEST_TTL
from orbit.models import User
from orbit.oauth.consent_request import PURPOSE_CONSENT, PURPOSE_CONSENT_CSRF, ConsentRequest
from orbit.oauth.redirects import name_matches_host, redirect_host
from orbit.runtime import Runtime
from orbit.security import hash_token
from orbit.templating import page

router = APIRouter(tags=["oauth"])

NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "same-origin"}
CONSENT_PATH = "/oauth/consent"


def _problem(heading: str, message: str, status_code: int = 400) -> Response:
    return page("pages/error.html", status_code=status_code, heading=heading, message=message)


def _expired() -> Response:
    return _problem(
        "This request expired",
        "Go back to your assistant and start the connection again.",
    )


def _read_request(runtime: Runtime, token: str) -> ConsentRequest | None:
    payload = runtime.env.signer.unsign(
        token, PURPOSE_CONSENT, int(CONSENT_REQUEST_TTL.total_seconds())
    )
    return ConsentRequest.from_payload(payload) if payload else None


def _sign_in_redirect(next_path: str) -> Response:
    return RedirectResponse(
        f"/auth/sign-in?next={quote(next_path, safe='')}", status_code=303, headers=NO_STORE
    )


def _csrf_for(runtime: Runtime, user: User, request_token: str) -> str:
    return runtime.env.signer.sign(
        {"u": user.id, "r": hash_token(request_token)[:24]}, PURPOSE_CONSENT_CSRF
    )


def _csrf_valid(runtime: Runtime, user: User, request_token: str, csrf: str) -> bool:
    payload = runtime.env.signer.unsign(
        csrf, PURPOSE_CONSENT_CSRF, int(CONSENT_REQUEST_TTL.total_seconds())
    )
    return bool(
        payload
        and payload.get("u") == user.id
        and payload.get("r") == hash_token(request_token)[:24]
    )


def _back_to_client(consent: ConsentRequest, issuer: str, **params: str | None) -> Response:
    target = construct_redirect_uri(consent.redirect_uri, iss=issuer, state=consent.state, **params)
    return RedirectResponse(target, status_code=303, headers=NO_STORE)


@router.get(CONSENT_PATH)
async def consent_page(
    request: Request,
    request_token: Annotated[str, Query(alias="request")] = "",
) -> Response:
    runtime = get_runtime(request)
    consent = _read_request(runtime, request_token)
    if consent is None:
        return _expired()
    client = await runtime.provider.get_client(consent.client_id)
    if client is None:
        return _problem("Unknown assistant", "That assistant is not registered with Orbit.")
    here = f"{request.url.path}?{request.url.query}"
    user = await run_in_threadpool(optional_user, request)
    if user is None:
        return _sign_in_redirect(here)
    client_name = client.client_name or "An assistant"
    host = redirect_host([consent.redirect_uri])
    return page(
        "pages/consent.html",
        form_action_self=False,
        client_name=client_name,
        redirect_host=host,
        name_mismatch=not name_matches_host(client_name, host),
        email=user.email,
        request_token=request_token,
        csrf=_csrf_for(runtime, user, request_token),
        switch_next=here,
    )


@router.post(CONSENT_PATH)
async def consent_decision(
    request: Request,
    request_token: Annotated[str, Form(alias="request")] = "",
    csrf: Annotated[str, Form()] = "",
    decision: Annotated[str, Form()] = "",
) -> Response:
    require_same_origin(request)
    runtime = get_runtime(request)
    consent = _read_request(runtime, request_token)
    if consent is None:
        return _expired()
    user = await run_in_threadpool(optional_user, request)
    if user is None:
        return _sign_in_redirect(f"{CONSENT_PATH}?request={quote(request_token, safe='')}")
    if not _csrf_valid(runtime, user, request_token, csrf):
        return _problem(
            "Please try again", "That page was out of date. Reload it and choose again."
        )
    client = await runtime.provider.get_client(consent.client_id)
    if client is None:
        return _problem("Unknown assistant", "That assistant is not registered with Orbit.")
    issuer = runtime.settings.base_url
    if decision == "allow":
        code = await runtime.provider.issue_code(user.id, consent)
        return _back_to_client(consent, issuer, code=code)
    if decision == "deny":
        return _back_to_client(
            consent, issuer, error="access_denied", error_description="The person chose Cancel."
        )
    return _problem("Please try again", "Choose Allow or Cancel.")
