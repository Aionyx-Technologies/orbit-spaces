from __future__ import annotations

from fastapi import APIRouter, Response

from orbit.auth.deps import CurrentUser, DbSession
from orbit.routes.photos import photo_response
from orbit.services import profile as profile_service

router = APIRouter(tags=["users"])


@router.get("/users/{user_id}/avatar")
def read_user_avatar(user_id: str, user: CurrentUser, db: DbSession) -> Response:
    avatar = profile_service.read_avatar(db, user.id, user_id)
    return photo_response(avatar.data)
