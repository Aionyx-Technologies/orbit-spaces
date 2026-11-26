from __future__ import annotations

import pytest
from mcp.server.mcpserver import MCPServer
from sqlalchemy.orm import Session

from orbit.db import SessionFactory
from orbit.models import User
from orbit.services import items as items_service
from orbit.services import memory as memory_service
from orbit.services import profile as profile_service
from orbit.services.context import Env
from tests.conftest import Factory
from tests.image_helpers import picture
from tests.mcp_helpers import Caller, build_test_server, connect, text_of

pytestmark = pytest.mark.anyio

MODES = ["auto", "legacy"]
ABOUT = "Zebra-quartz-7731 plans the trips"


@pytest.fixture
def caller() -> Caller:
    return Caller()


@pytest.fixture
def server(env: Env, session_factory: SessionFactory, caller: Caller) -> MCPServer:
    return build_test_server(env, session_factory, caller)


@pytest.mark.parametrize("mode", MODES)
async def test_a_persons_about_line_and_photo_never_reach_an_assistant(
    server: MCPServer, caller: Caller, env: Env, db: Session, make: Factory, mode: str
) -> None:
    alex = make.user("alex@example.com", "Alex")
    blake = make.user("blake@example.com", "Blake")
    space = make.space(alex, "Goa trip", blake)
    blake_row = db.get(User, blake.id)
    assert blake_row is not None
    profile_service.update_me(db, blake_row, {"about": ABOUT})
    profile_service.set_avatar(db, env, blake_row, picture())
    items_service.share_item(db, env, blake.web(), space.id, "Hotels", "Three options")
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,000")
    caller.as_user(alex.principal())
    calls: list[tuple[str, dict[str, object]]] = [
        ("list_spaces", {}),
        ("get_space_context", {"space_id": space.id}),
        ("read_space", {"space_id": space.id}),
        ("export_space", {"space_id": space.id}),
    ]

    async with connect(server, mode) as client:
        results = [await client.call_tool(name, arguments) for name, arguments in calls]

    for (name, _), result in zip(calls, results, strict=True):
        text = text_of(result)
        assert result.is_error is not True, name
        assert "Blake" in text, name
        assert "Zebra-quartz" not in text, name
        assert "avatar" not in text.lower(), name
        assert "/api/users/" not in text, name
