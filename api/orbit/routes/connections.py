from __future__ import annotations

from fastapi import APIRouter, Response

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.oauth.connections import list_connections, revoke_connection

router = APIRouter(tags=["connections"])


@router.get("/connections")
def read_connections(
    user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.ConnectionsOut:
    views = list_connections(db, runtime.env, user.id)
    return schemas.ConnectionsOut(
        connections=[
            schemas.ConnectionOut(
                id=view.id,
                client_name=view.client_name,
                client_host=view.client_host,
                connected_at=view.connected_at,
            )
            for view in views
        ]
    )


@router.delete("/connections/{connection_id}", status_code=204)
def remove_connection(
    connection_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> Response:
    revoke_connection(db, runtime.env, user.id, connection_id)
    return Response(status_code=204)
