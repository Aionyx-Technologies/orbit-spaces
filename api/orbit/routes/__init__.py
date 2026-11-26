from __future__ import annotations

from fastapi import APIRouter, Depends

from orbit.auth.deps import require_same_origin
from orbit.routes import (
    billing,
    connections,
    demo,
    events,
    invites,
    items,
    me,
    spaces,
    templates,
    users,
)


def build_api_router() -> APIRouter:
    router = APIRouter(prefix="/api", dependencies=[Depends(require_same_origin)])
    for module in (
        me,
        billing,
        spaces,
        items,
        invites,
        connections,
        events,
        demo,
        templates,
        users,
    ):
        router.include_router(module.router)
    return router
