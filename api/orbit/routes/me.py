from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, File, Request, Response, UploadFile
from sqlalchemy.orm import Session

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.auth.sessions import (
    SESSION_COOKIE,
    LastSignIn,
    clear_session_cookie,
    last_sign_in,
    revoke_all_sessions,
)
from orbit.errors import RateLimited
from orbit.limits import ACCOUNT_EXPORTS_PER_USER, AVATAR_UPLOAD_MAX_BYTES
from orbit.models import BillingAccount, User
from orbit.plans import PLAN_FREE, PLAN_PLUS, plan_is_paid
from orbit.runtime import Runtime
from orbit.services import account_export, accounts, ai_uses, email_allowance
from orbit.services import profile as profile_service

router = APIRouter(tags=["me"])


def me_out(
    db: Session, user: User, runtime: Runtime, last: LastSignIn | None = None
) -> schemas.MeOut:
    uses = ai_uses.allowance(db, runtime.env, user)
    account = db.get(BillingAccount, user.id)
    paid = account is not None and plan_is_paid(account.plan, account.status)
    emails = email_allowance.usage(db, runtime.settings, user.id, runtime.env.now())
    return schemas.MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
        mcp_url=runtime.settings.mcp_url,
        combine_enabled=runtime.env.llm is not None,
        draft_enabled=runtime.env.drafter is not None,
        ai_uses=schemas.AiUsesOut(
            limit=uses.limit, used=uses.used, remaining=uses.remaining, resets_at=uses.resets_at
        ),
        instant_emails=(
            schemas.EmailUsesOut(limit=emails.limit, used=emails.used, remaining=emails.remaining)
            if emails is not None
            else None
        ),
        about=user.about,
        avatar_url=profile_service.avatar_url(user.id, user.avatar_updated_at),
        time_zone=user.time_zone,
        email_frequency=user.email_frequency,
        default_space_id=user.default_space_id,
        last_sign_in=(
            schemas.SignInOut(at=last.at, browser=last.browser) if last is not None else None
        ),
        plan=PLAN_PLUS if paid else PLAN_FREE,
        billing_enabled=runtime.env.billing is not None,
    )


def _me(request: Request, user: User, db: DbSession, runtime: Runtime) -> schemas.MeOut:
    last = last_sign_in(db, user.id, request.cookies.get(SESSION_COOKIE))
    return me_out(db, user, runtime, last)


@router.get("/me")
def read_me(
    request: Request, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.MeOut:
    return _me(request, user, db, runtime)


@router.patch("/me")
def update_me(
    body: schemas.MePatchIn,
    request: Request,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.MeOut:
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    shown_before = (user.display_name, user.about)
    updated = profile_service.update_me(db, user, changes)
    if (updated.display_name, updated.about) != shown_before:
        profile_service.announce_profile_changed(db, runtime.env, updated.id)
    return _me(request, updated, db, runtime)


@router.post("/me/avatar")
def upload_avatar(
    file: Annotated[UploadFile, File()],
    request: Request,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.MeOut:
    raw = file.file.read(AVATAR_UPLOAD_MAX_BYTES + 1)
    return _me(request, profile_service.set_avatar(db, runtime.env, user, raw), db, runtime)


@router.delete("/me/avatar")
def remove_avatar(
    request: Request, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.MeOut:
    return _me(request, profile_service.remove_avatar(db, runtime.env, user), db, runtime)


@router.post("/me/sessions/revoke-all", status_code=204)
def sign_out_everywhere(user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> Response:
    revoke_all_sessions(db, user.id)
    response = Response(status_code=204)
    clear_session_cookie(response, runtime.settings)
    return response


@router.get("/me/export")
def export_me(user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> Response:
    if not runtime.env.limiter.allow(f"account-export:{user.id}", ACCOUNT_EXPORTS_PER_USER):
        raise RateLimited("You have downloaded your data a lot today. Please try again tomorrow.")
    document = account_export.export_account(db, runtime.env, user)
    day = runtime.env.now().strftime("%Y-%m-%d")
    return Response(
        content=json.dumps(document, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="orbit-account-{day}.json"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/me", status_code=204)
def delete_me(user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> Response:
    accounts.delete_account(db, runtime.env, user)
    response = Response(status_code=204)
    clear_session_cookie(response, runtime.settings)
    return response
