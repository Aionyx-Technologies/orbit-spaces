from __future__ import annotations

from fastapi import APIRouter

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.routes.mappers import template_out
from orbit.services import templates as templates_service
from orbit.services.context import Actor
from orbit.space_templates import builtin_templates

router = APIRouter(tags=["templates"])


@router.get("/templates")
def list_templates(user: CurrentUser) -> schemas.TemplatesOut:
    return schemas.TemplatesOut(
        templates=[template_out(template) for template in builtin_templates().values()]
    )


@router.post("/templates/draft")
def draft_template(
    body: schemas.DraftIn, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.DraftOut:
    draft = templates_service.draft_template(db, runtime.env, Actor.web(user.id), body.purpose)
    return schemas.DraftOut(template=template_out(draft.template), drafted=draft.drafted)


@router.post("/spaces/suggest")
def suggest_space(
    body: schemas.SuggestIn, user: CurrentUser, db: DbSession, runtime: RuntimeDep
) -> schemas.SuggestOut:
    suggestion = templates_service.suggest_space(db, runtime.env, Actor.web(user.id), body.purpose)
    return schemas.SuggestOut(
        suggested=suggestion.suggested,
        name=suggestion.name,
        template=template_out(suggestion.template),
        base_template_id=suggestion.base_template_id,
        facts=[schemas.SuggestedFactOut(key=f.key, value=f.value) for f in suggestion.facts],
    )
