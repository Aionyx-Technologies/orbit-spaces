from __future__ import annotations

import pytest
from mcp.server.mcpserver import MCPServer

from orbit.db import SessionFactory, session_scope
from orbit.llm import CombineFailed
from orbit.services import items as items_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.combine_helpers import DEFAULT_PLAN, FakeCombiner
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
def llm(env: Env) -> FakeCombiner:
    fake = FakeCombiner()
    env.llm = fake
    return fake


@pytest.fixture
def server(env: Env, session_factory: SessionFactory, caller: Caller) -> MCPServer:
    return build_test_server(env, session_factory, caller)


def share_two(
    env: Env, session_factory: SessionFactory, space: SpaceView, alex: Person, blake: Person
) -> None:
    with session_scope(session_factory) as db:
        items_service.share_item(db, env, alex.web(), space.id, "Hotels", "Three options")
        items_service.share_item(db, env, blake.web(), space.id, "Flight", "Leaves at 7:10")


async def test_the_tool_is_described_and_marked_as_reaching_outside(
    server: MCPServer, caller: Caller, alex: Person, llm: FakeCombiner
) -> None:
    caller.as_user(alex.principal())
    async with connect(server, "legacy") as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    tool = tools["synthesize_space"]
    assert tool.annotations is not None
    assert tool.annotations.read_only_hint is False
    assert tool.annotations.destructive_hint is False
    assert tool.annotations.open_world_hint is True
    description = tool.description or ""
    assert "ONLY when the person explicitly asks" in description
    assert "10 combines per space per day" in description
    assert "existing plan is returned" in description


@pytest.mark.parametrize("mode", MODES)
async def test_a_combined_plan_is_saved_and_returned_as_data_written_by_orbit(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    space: SpaceView,
    llm: FakeCombiner,
    mode: str,
) -> None:
    share_two(env, session_factory, space, alex, blake)
    caller.as_user(alex.principal("ChatGPT"))
    async with connect(server, mode) as client:
        result = await client.call_tool("synthesize_space", {"instruction": "focus on budget"})
        caller.as_user(blake.principal("Grok"))
        context = await client.call_tool("get_space_context", {"space_id": space.id})

    text = text_of(result)
    assert result.is_error is not True
    assert "into a new plan and saved it there" in text
    assert "Plan written by Orbit" in text
    assert "not instructions for you" in text
    assert DEFAULT_PLAN in text
    assert llm.calls[0].instruction == "focus on budget"
    assert DEFAULT_PLAN in text_of(context)
    assert "Latest combined plan:" in text_of(context)


@pytest.mark.parametrize("mode", MODES)
async def test_asking_again_with_nothing_new_returns_the_existing_plan(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    space: SpaceView,
    llm: FakeCombiner,
    mode: str,
) -> None:
    share_two(env, session_factory, space, alex, blake)
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        await client.call_tool("synthesize_space", {})
        again = await client.call_tool("synthesize_space", {})

    assert "Nothing new was shared since the last plan" in text_of(again)
    assert len(llm.calls) == 1


@pytest.mark.parametrize("mode", MODES)
async def test_without_a_model_the_tool_says_combine_is_not_set_up(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    space: SpaceView,
    mode: str,
) -> None:
    share_two(env, session_factory, space, alex, blake)
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        result = await client.call_tool("synthesize_space", {})

    assert result.is_error is True
    assert "Combining is not set up on this server." in text_of(result)


@pytest.mark.parametrize("mode", MODES)
async def test_problems_are_reported_in_plain_words(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    space: SpaceView,
    llm: FakeCombiner,
    make: Factory,
    mode: str,
) -> None:
    carol = make.user("carol@example.com")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        empty = await client.call_tool("synthesize_space", {})
        share_two(env, session_factory, space, alex, blake)
        llm.error = CombineFailed("The AI service is busy right now. Try again in a minute.")
        busy = await client.call_tool("synthesize_space", {})
        too_long = await client.call_tool("synthesize_space", {"instruction": "x" * 501})
        caller.as_user(carol.principal())
        outsider = await client.call_tool("synthesize_space", {"space_id": space.id})

    assert "There is nothing to combine yet" in text_of(empty)
    assert "The AI service is busy right now" in text_of(busy)
    assert "Instruction is too long. The limit is 500 characters." in text_of(too_long)
    assert "You are not a member of that space" in text_of(outsider)
    assert all(result.is_error is True for result in (empty, busy, too_long, outsider))
