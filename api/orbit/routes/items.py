from __future__ import annotations

from fastapi import APIRouter, Response

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.limits import DEFAULT_PAGE_SIZE
from orbit.routes.mappers import fact_event_out, fact_out, item_out
from orbit.services import combine as combine_service
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services.context import Actor

router = APIRouter(tags=["items"])


@router.get("/spaces/{space_id}/items")
def read_feed(
    space_id: str,
    user: CurrentUser,
    db: DbSession,
    before: str | None = None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> schemas.ItemsPageOut:
    page = items_service.list_items(db, user.id, space_id, before or None, limit)
    return schemas.ItemsPageOut(
        items=[item_out(item, user.id) for item in page.items], next_before=page.next_before
    )


@router.post("/spaces/{space_id}/items", status_code=201)
def share_item(
    space_id: str,
    body: schemas.ShareIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.ItemOut:
    item = items_service.share_item(
        db, runtime.env, Actor.web(user.id), space_id, body.title, body.content
    )
    return item_out(item, user.id)


@router.delete("/items/{item_id}", status_code=204)
def retract_item(item_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep) -> Response:
    items_service.retract_item(db, runtime.env, Actor.web(user.id), item_id)
    return Response(status_code=204)


@router.post("/spaces/{space_id}/combine")
def combine(
    space_id: str,
    body: schemas.CombineIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.CombineOut:
    result = combine_service.combine_space(
        db, runtime.env, Actor.web(user.id), space_id, body.instruction
    )
    return schemas.CombineOut(item=item_out(result.item, user.id), created=result.created)


@router.put("/spaces/{space_id}/memory")
def set_fact(
    space_id: str,
    body: schemas.FactIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.FactResultOut:
    change = memory_service.set_fact(
        db, runtime.env, Actor.web(user.id), space_id, body.key, body.value
    )
    return schemas.FactResultOut(
        fact=fact_out(change.fact),
        replaced_value=change.replaced_value,
        changed=change.changed,
    )


@router.post("/spaces/{space_id}/memory/rename")
def rename_fact(
    space_id: str,
    body: schemas.FactRenameIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
) -> schemas.FactResultOut:
    change = memory_service.rename_fact(
        db, runtime.env, Actor.web(user.id), space_id, body.key, body.new_key
    )
    return schemas.FactResultOut(
        fact=fact_out(change.fact), replaced_value=None, changed=change.changed
    )


@router.delete("/spaces/{space_id}/memory", status_code=204)
def delete_fact(
    space_id: str, user: CurrentUser, db: DbSession, runtime: RuntimeDep, key: str = ""
) -> Response:
    memory_service.delete_fact(db, runtime.env, Actor.web(user.id), space_id, key)
    return Response(status_code=204)


@router.get("/spaces/{space_id}/memory/history")
def fact_history(
    space_id: str, user: CurrentUser, db: DbSession, key: str | None = None
) -> schemas.FactHistoryOut:
    events = memory_service.fact_events(db, user.id, space_id, key or None)
    return schemas.FactHistoryOut(entries=[fact_event_out(event) for event in events])
