from __future__ import annotations

from fastapi import APIRouter, Request, Response

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep, viewer_of
from orbit.routes.photos import photo_response
from orbit.services import invites as invites_service
from orbit.services.context import Actor

router = APIRouter(tags=["invites"])


@router.post("/spaces/{space_id}/invites", status_code=201)
def create_invite(
    space_id: str,
    body: schemas.InviteIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.InviteCreatedOut:
    created = invites_service.create_invite(
        db, runtime.env, Actor.web(user.id), space_id, body.email
    )
    return schemas.InviteCreatedOut(
        url=created.url, expires_at=created.expires_at, emailed=created.emailed
    )


@router.post("/spaces/{space_id}/invites/{invite_id}/resend", status_code=201)
def resend_invite(
    space_id: str, invite_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.InviteCreatedOut:
    created = invites_service.resend_invite(
        db, runtime.env, Actor.web(user.id), space_id, invite_id
    )
    return schemas.InviteCreatedOut(
        url=created.url, expires_at=created.expires_at, emailed=created.emailed
    )


@router.delete("/spaces/{space_id}/invites/{invite_id}", status_code=204)
def cancel_invite(
    space_id: str, invite_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> Response:
    invites_service.cancel_invite(db, runtime.env, Actor.web(user.id), space_id, invite_id)
    return Response(status_code=204)


@router.get("/invites/{token}")
def view_invite(
    token: str, request: Request, db: DbSession, runtime: RuntimeDep
) -> schemas.InviteViewOut:
    viewer = viewer_of(request, db)
    view = invites_service.get_invite_view(
        db, runtime.env, token, viewer.id if viewer is not None else None
    )
    return schemas.InviteViewOut(
        status=view.status,
        space_name=view.space_name,
        invited_by=view.invited_by,
        expires_at=view.expires_at,
        signed_in=view.signed_in,
        already_member=view.already_member,
        inviter_avatar_url=(
            f"/api/invites/{token}/inviter-avatar?v={int(view.inviter_avatar_updated_at.timestamp())}"
            if view.inviter_avatar_updated_at is not None
            else None
        ),
    )


@router.get("/invites/{token}/inviter-avatar")
def inviter_avatar(token: str, db: DbSession, runtime: RuntimeDep) -> Response:
    avatar = invites_service.read_inviter_avatar(db, runtime.env, token)
    return photo_response(avatar.data)


@router.post("/invites/{token}/accept")
def accept_invite(
    token: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.AcceptOut:
    result = invites_service.accept_invite(db, runtime.env, user.id, token)
    return schemas.AcceptOut(space_id=result.space_id, already_member=result.already_member)


@router.get("/invitations")
def list_invitations(
    user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.InvitationsOut:
    pending = invites_service.list_pending_invitations(db, runtime.env, user)
    return schemas.InvitationsOut(
        invitations=[
            schemas.InvitationOut(
                id=invitation.id,
                space_name=invitation.space_name,
                invited_by=invitation.invited_by,
                invited_at=invitation.invited_at,
                expires_at=invitation.expires_at,
            )
            for invitation in pending
        ]
    )


@router.post("/invitations/{invitation_id}/accept")
def accept_invitation(
    invitation_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.AcceptOut:
    result = invites_service.accept_invitation(db, runtime.env, user, invitation_id)
    return schemas.AcceptOut(space_id=result.space_id, already_member=result.already_member)


@router.post("/invitations/{invitation_id}/decline", status_code=204)
def decline_invitation(
    invitation_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> Response:
    invites_service.decline_invitation(db, runtime.env, user, invitation_id)
    return Response(status_code=204)
