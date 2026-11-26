from __future__ import annotations

import pytest
from mcp.server.mcpserver import MCPServer
from sqlalchemy.orm import Session

from orbit.db import SessionFactory
from orbit.services import memory as memory_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.conftest import Factory, Person
from tests.mcp_helpers import Caller, build_test_server, connect, text_of

pytestmark = pytest.mark.anyio

MODES = ["auto", "legacy"]


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


@pytest.fixture
def blake(make: Factory) -> Person:
    return make.user("blake@example.com", "Blake")


@pytest.fixture
def space(make: Factory, alex: Person, blake: Person) -> SpaceView:
    return make.space(alex, "Goa trip", blake)


@pytest.fixture
def caller() -> Caller:
    return Caller()


@pytest.fixture
def server(env: Env, session_factory: SessionFactory, caller: Caller) -> MCPServer:
    return build_test_server(env, session_factory, caller)


async def test_the_fact_tools_are_described_for_assistants(
    server: MCPServer, caller: Caller, alex: Person
) -> None:
    caller.as_user(alex.principal())
    async with connect(server, "legacy") as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    forget = tools["forget_in_space"]
    assert forget.annotations is not None
    assert forget.annotations.destructive_hint is True
    assert "for everyone" in (forget.description or "")
    assert "history" in (forget.description or "")
    assert "ONLY when the person explicitly asks" in (forget.description or "")
    rename = tools["rename_fact_in_space"]
    assert rename.annotations is not None
    assert (rename.annotations.read_only_hint, rename.annotations.destructive_hint) == (
        False,
        False,
    )
    history = tools["get_fact_history"]
    assert history.annotations is not None
    assert history.annotations.read_only_hint is True


@pytest.mark.parametrize("mode", MODES)
async def test_an_assistant_can_rename_a_fact(
    server: MCPServer,
    caller: Caller,
    alex: Person,
    blake: Person,
    space: SpaceView,
    db: Session,
    env: Env,
    mode: str,
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    caller.as_user(blake.principal("Claude"))
    async with connect(server, mode) as client:
        renamed = await client.call_tool(
            "rename_fact_in_space", {"space_id": space.id, "key": "dates", "new_key": "Trip"}
        )
        unchanged = await client.call_tool(
            "rename_fact_in_space", {"key": "Trip", "new_key": "Trip"}
        )
        missing = await client.call_tool("rename_fact_in_space", {"key": "Nope", "new_key": "X"})
        context = await client.call_tool("get_space_context", {"space_id": space.id})

    assert renamed.is_error is not True
    assert "Renamed the fact" in text_of(renamed)
    assert "New name: Trip" in text_of(renamed)
    assert "Nothing changed" in text_of(unchanged)
    assert missing.is_error is True
    assert "There is no fact called “Nope”." in text_of(missing)
    assert "Trip: Dec 20" in text_of(context)
    assert "Fact set by Blake via Claude" in text_of(context)


@pytest.mark.parametrize("mode", MODES)
async def test_a_rename_onto_a_taken_name_is_refused(
    server: MCPServer,
    caller: Caller,
    alex: Person,
    space: SpaceView,
    db: Session,
    env: Env,
    mode: str,
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, alex.web(), space.id, "Cost", "$2,000")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        taken = await client.call_tool("rename_fact_in_space", {"key": "Cost", "new_key": "budget"})

    assert taken.is_error is True
    assert "There is already a fact called “budget”." in text_of(taken)


@pytest.mark.parametrize("mode", MODES)
async def test_an_assistant_can_delete_a_fact_for_everyone(
    server: MCPServer,
    caller: Caller,
    alex: Person,
    blake: Person,
    space: SpaceView,
    db: Session,
    env: Env,
    mode: str,
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    caller.as_user(blake.principal("Claude"))
    async with connect(server, mode) as client:
        deleted = await client.call_tool("forget_in_space", {"key": "BUDGET"})
        again = await client.call_tool("forget_in_space", {"key": "Budget"})
        context = await client.call_tool("get_space_context", {"space_id": space.id})

    assert deleted.is_error is not True
    assert "Deleted the fact" in text_of(deleted)
    assert "recorded in the space's history" in text_of(deleted)
    assert again.is_error is True
    assert "Shared facts: none yet." in text_of(context)


@pytest.mark.parametrize("mode", MODES)
async def test_an_assistant_can_read_the_fact_history(
    server: MCPServer,
    caller: Caller,
    alex: Person,
    blake: Person,
    space: SpaceView,
    db: Session,
    env: Env,
    mode: str,
) -> None:
    memory_service.set_fact(db, env, alex.via("ChatGPT"), space.id, "Budget", "$3,000")
    memory_service.set_fact(db, env, blake.web(), space.id, "Budget", "$3,500")
    memory_service.rename_fact(db, env, blake.web(), space.id, "Budget", "Total")
    memory_service.set_fact(db, env, alex.web(), space.id, "Dates", "Dec 20")
    memory_service.delete_fact(db, env, alex.web(), space.id, "Dates")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        everything = await client.call_tool("get_fact_history", {})
        one = await client.call_tool("get_fact_history", {"key": "total"})
        missing = await client.call_tool("get_fact_history", {"key": "Dates"})

    text = text_of(everything)
    assert everything.is_error is not True
    assert "newest first (5 shown)" in text
    assert text.index("Fact deleted by Alex") < text.index("Fact renamed by Blake")
    assert text.index("Fact renamed by Blake") < text.index("Fact added by Alex via ChatGPT")
    assert "Earlier name: Budget" in text
    assert "Earlier value: $3,000" in text
    assert "Last value: Dec 20" in text
    assert "Changes to this fact, newest first (3 shown)" in text_of(one)
    assert "Dates" not in text_of(one)
    assert missing.is_error is True


@pytest.mark.parametrize("mode", MODES)
async def test_an_empty_history_says_so(
    server: MCPServer, caller: Caller, alex: Person, space: SpaceView, mode: str
) -> None:
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        result = await client.call_tool("get_fact_history", {"space_id": space.id})

    assert "No changes to the shared facts in this space yet." in text_of(result)


@pytest.mark.parametrize("mode", MODES)
async def test_the_fact_tools_refuse_outsiders(
    server: MCPServer,
    caller: Caller,
    make: Factory,
    alex: Person,
    space: SpaceView,
    db: Session,
    env: Env,
    mode: str,
) -> None:
    memory_service.set_fact(db, env, alex.web(), space.id, "Budget", "$3,000")
    carol = make.user("carol@example.com", "Carol")
    caller.as_user(carol.principal())
    async with connect(server, mode) as client:
        results = [
            await client.call_tool(
                "rename_fact_in_space", {"space_id": space.id, "key": "Budget", "new_key": "X"}
            ),
            await client.call_tool("forget_in_space", {"space_id": space.id, "key": "Budget"}),
            await client.call_tool("get_fact_history", {"space_id": space.id}),
        ]

    for result in results:
        assert result.is_error is True
        assert "not a member" in text_of(result)
    assert [fact.key for fact in memory_service.current_facts(db, space.id)] == ["Budget"]
