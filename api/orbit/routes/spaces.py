from __future__ import annotations

import re

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.routes.mappers import (
    fact_out,
    item_out,
    member_out,
    space_summary_out,
    template_fact_out,
    template_out,
)
from orbit.services import export as export_service
from orbit.services import invites as invites_service
from orbit.services import overview as overview_service
from orbit.services import previews as previews_service
from orbit.services import readstate as readstate_service
from orbit.services import spaces as spaces_service
from orbit.services import templates as templates_service
from orbit.services.billing_state import entitlements_for
from orbit.services.context import Actor

router = APIRouter(tags=["spaces"])

UNSAFE_FILENAME = re.compile(r"[^a-z0-9]+")


@router.get("/spaces")
def list_my_spaces(user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> schemas.SpacesOut:
    views = spaces_service.list_spaces(db, user.id)
    flags = spaces_service.notify_flags(db, user.id, [view.id for view in views])
    previews = previews_service.preview_spaces(db, views)
    counts = readstate_service.new_counts(db, user.id, [view.id for view in views])
    return schemas.SpacesOut(
        spaces=[
            space_summary_out(
                view, user.id, flags.get(view.id, True), previews[view.id], counts[view.id]
            )
            for view in views
        ],
        limits=schemas.SpaceLimitsOut(
            created_spaces=spaces_service.count_created_spaces(db, user.id),
            max_created_spaces=entitlements_for(
                db, runtime.env.settings, user.id, runtime.env.now()
            ).max_created_spaces,
        ),
    )


@router.post("/spaces", status_code=201)
def create_space(
    body: schemas.CreateSpaceIn, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.SpaceSummaryOut:
    custom = body.template.model_dump() if body.template is not None else None
    template = templates_service.choose_template(body.template_id, custom)
    facts = [
        spaces_service.InitialFact(fact.key, fact.value, fact.suggested) for fact in body.facts
    ]
    view = spaces_service.create_space(
        db, runtime.env, Actor.web(user.id), body.name, template, facts
    )
    previews = previews_service.preview_spaces(db, [view])
    return space_summary_out(view, user.id, True, previews[view.id], 0)


@router.get("/spaces/{space_id}")
def read_space(
    space_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.SpaceDetailOut:
    detail = overview_service.get_space_detail(db, user.id, space_id)
    waiting = invites_service.list_waiting_invites(db, runtime.env, user.id, space_id)
    notify = spaces_service.notify_flags(db, user.id, [space_id]).get(space_id, True)
    plan = detail.latest_plan
    return schemas.SpaceDetailOut(
        id=detail.space.id,
        name=detail.space.name,
        created_at=detail.space.created_at,
        is_creator=detail.space.created_by == user.id,
        notify_email=notify,
        members=[member_out(member, user.id) for member in detail.space.members],
        memory=[fact_out(fact) for fact in detail.facts],
        template=template_out(detail.space.template),
        unset_facts=[template_fact_out(fact) for fact in detail.unset_facts],
        latest_plan=item_out(plan, user.id) if plan else None,
        invites=[
            schemas.WaitingInviteOut(
                id=invite.id,
                email=invite.email,
                invited_by=invite.invited_by,
                invited_at=invite.invited_at,
                expires_at=invite.expires_at,
                status=invite.status,
            )
            for invite in waiting
        ],
    )


@router.post("/spaces/{space_id}/read", status_code=204)
def mark_space_read(
    space_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> Response:
    readstate_service.mark_read(db, user.id, space_id, runtime.env.now())
    return Response(status_code=204)


@router.put("/spaces/{space_id}/template")
def replace_template(
    space_id: str, body: schemas.TemplateIn, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.TemplateOut:
    template = templates_service.set_space_template(
        db, runtime.env, Actor.web(user.id), space_id, body.model_dump()
    )
    return template_out(template)


@router.delete("/spaces/{space_id}", status_code=204)
def delete_space(space_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> Response:
    spaces_service.delete_space(db, runtime.env, Actor.web(user.id), space_id)
    return Response(status_code=204)


@router.patch("/spaces/{space_id}/membership")
def update_membership(
    space_id: str, body: schemas.MembershipPatchIn, user: CurrentUser, db: DbSession
) -> schemas.MembershipOut:
    enabled = spaces_service.set_notify(db, user.id, space_id, body.notify_email)
    return schemas.MembershipOut(notify_email=enabled)


@router.get("/spaces/{space_id}/export")
def export_space(
    space_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> JSONResponse:
    data = export_service.export_space(db, runtime.env, user.id, space_id)
    slug = UNSAFE_FILENAME.sub("-", str(data["space"]["name"]).lower()).strip("-") or "space"
    return JSONResponse(
        data,
        headers={"Content-Disposition": f'attachment; filename="orbit-{slug}.json"'},
    )
