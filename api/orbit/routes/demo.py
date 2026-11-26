from __future__ import annotations

from fastapi import APIRouter

from orbit import schemas
from orbit.auth.deps import RuntimeDep
from orbit.services.demo import DEMO_PEOPLE

router = APIRouter(tags=["demo"])


@router.get("/demo")
def read_demo(runtime: RuntimeDep) -> schemas.DemoOut:
    if not runtime.settings.demo_mode:
        return schemas.DemoOut(enabled=False, people=[])
    return schemas.DemoOut(
        enabled=True,
        people=[schemas.DemoPersonOut(key=person.key, name=person.name) for person in DEMO_PEOPLE],
    )
