from __future__ import annotations

import re

import pytest
from mcp.server.mcpserver import MCPServer

from orbit.db import SessionFactory, session_scope
from orbit.services import invites as invites_service
from orbit.services import items as items_service
from orbit.services.context import Env
from orbit.services.views import SpaceView
from tests.conftest import Factory, Person, RecordingSender
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
def caller() -> Caller:
    return Caller()


@pytest.fixture
def server(env: Env, session_factory: SessionFactory, caller: Caller) -> MCPServer:
    return build_test_server(env, session_factory, caller)


async def test_the_new_tools_are_described_for_assistants(
    server: MCPServer, caller: Caller, alex: Person
) -> None:
    caller.as_user(alex.principal())
    async with connect(server, "legacy") as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    assert set(tools) == {
        "list_spaces",
        "list_templates",
        "create_space",
        "invite_to_space",
        "get_space_context",
        "read_space",
        "share_to_space",
        "remember_in_space",
        "rename_fact_in_space",
        "forget_in_space",
        "get_fact_history",
        "synthesize_space",
        "retract_item",
        "list_invitations",
        "accept_invitation",
        "decline_invitation",
        "set_space_notifications",
        "export_space",
        "delete_space",
        "get_space_template",
        "draft_template",
        "update_space_template",
    }
    for name in (
        "list_templates",
        "list_invitations",
        "export_space",
        "get_space_template",
        "get_fact_history",
    ):
        reading = tools[name].annotations
        assert reading is not None
        assert reading.read_only_hint is True
    for name in (
        "create_space",
        "invite_to_space",
        "retract_item",
        "rename_fact_in_space",
        "forget_in_space",
        "synthesize_space",
        "accept_invitation",
        "decline_invitation",
        "set_space_notifications",
        "delete_space",
        "draft_template",
        "update_space_template",
    ):
        assert "ONLY when the person explicitly asks" in (tools[name].description or "")
        changing = tools[name].annotations
        assert changing is not None
        assert changing.read_only_hint is False
    for name in ("delete_space", "decline_invitation", "forget_in_space"):
        irreversible = tools[name].annotations
        assert irreversible is not None
        assert irreversible.destructive_hint is True
    for name in (
        "accept_invitation",
        "set_space_notifications",
        "update_space_template",
        "rename_fact_in_space",
    ):
        reversible = tools[name].annotations
        assert reversible is not None
        assert reversible.destructive_hint is False
    required = {
        "delete_space": {"space_id", "confirm_name"},
        "accept_invitation": {"invitation_id"},
        "decline_invitation": {"invitation_id"},
        "set_space_notifications": {"enabled"},
        "draft_template": {"purpose"},
        "update_space_template": {"name"},
        "rename_fact_in_space": {"key", "new_key"},
        "forget_in_space": {"key"},
        "get_fact_history": set(),
    }
    for name, arguments in required.items():
        assert set(tools[name].input_schema.get("required", [])) == arguments
    for name in ("create_space", "invite_to_space"):
        annotations = tools[name].annotations
        assert annotations is not None
        assert annotations.read_only_hint is False
        assert annotations.destructive_hint is False
    retract = tools["retract_item"].annotations
    assert retract is not None
    assert retract.read_only_hint is False
    assert retract.destructive_hint is True


@pytest.mark.parametrize("mode", MODES)
async def test_a_space_created_by_an_assistant_is_usable_straight_away(
    server: MCPServer, caller: Caller, alex: Person, mode: str
) -> None:
    caller.as_user(alex.principal("ChatGPT"))
    async with connect(server, mode) as client:
        created = await client.call_tool("create_space", {"name": "  Goa   trip "})
        shared = await client.call_tool("share_to_space", {"title": "Hi", "content": "First"})
        listed = await client.call_tool("list_spaces", {})

    text = text_of(created)
    assert created.is_error is not True
    assert 'Created the Orbit space "Goa trip"' in text
    assert re.search(r"Space id: [0-9a-f-]{36}", text)
    assert shared.is_error is not True
    assert "Goa trip" in text_of(listed)


@pytest.mark.parametrize("mode", MODES)
async def test_create_space_explains_problems_plainly(
    server: MCPServer, caller: Caller, alex: Person, mode: str
) -> None:
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        empty = await client.call_tool("create_space", {"name": "  "})
        long = await client.call_tool("create_space", {"name": "x" * 101})

    assert empty.is_error is True
    assert "Space name cannot be empty." in text_of(empty)
    assert long.is_error is True
    assert "The limit is 100 characters" in text_of(long)


@pytest.mark.parametrize("mode", MODES)
async def test_an_invite_link_can_be_created_and_works(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    make: Factory,
    mode: str,
) -> None:
    space: SpaceView = make.space(alex, "Goa trip")
    caller.as_user(alex.principal("Grok"))
    async with connect(server, mode) as client:
        result = await client.call_tool("invite_to_space", {})

    text = text_of(result)
    match = re.search(r"https://orbit\.test/invite/(\S+)", text)
    assert match is not None
    assert "valid for 7 days" in text
    assert "Send this link to the person yourself" in text
    with session_scope(session_factory) as db:
        accepted = invites_service.accept_invite(db, env, blake.id, match.group(1))
    assert accepted.space_id == space.id


@pytest.mark.parametrize("mode", MODES)
async def test_an_invite_can_be_emailed_by_the_assistant(
    server: MCPServer,
    caller: Caller,
    env: Env,
    alex: Person,
    make: Factory,
    mode: str,
) -> None:
    recorder = RecordingSender()
    env.mailer.sender = recorder
    make.space(alex, "Goa trip")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        result = await client.call_tool("invite_to_space", {"email": "blake@example.com"})
    env.mailer.drain()

    assert "Orbit also emailed the link to that address." in text_of(result)
    [message] = recorder.to("blake@example.com")
    assert message.subject == "Alex invited you to Goa trip on Orbit"


@pytest.mark.parametrize("mode", MODES)
async def test_invite_problems_are_reported_not_hidden(
    server: MCPServer,
    caller: Caller,
    alex: Person,
    blake: Person,
    make: Factory,
    mode: str,
) -> None:
    space = make.space(alex, "Goa trip")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        bad_email = await client.call_tool("invite_to_space", {"email": "nope"})
        caller.as_user(blake.principal())
        outsider = await client.call_tool("invite_to_space", {"space_id": space.id})

    assert bad_email.is_error is True
    assert "Enter a valid email address." in text_of(bad_email)
    assert outsider.is_error is True
    assert "You are not a member of that space" in text_of(outsider)


@pytest.mark.parametrize("mode", MODES)
async def test_inviting_with_several_spaces_asks_which(
    server: MCPServer, caller: Caller, alex: Person, make: Factory, mode: str
) -> None:
    make.space(alex, "One")
    make.space(alex, "Two")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        result = await client.call_tool("invite_to_space", {})

    assert result.is_error is not True
    assert "Ask them which space" in text_of(result)


@pytest.mark.parametrize("mode", MODES)
async def test_an_assistant_can_take_back_what_its_person_shared(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    make: Factory,
    mode: str,
) -> None:
    space = make.space(alex, "Goa trip")
    with session_scope(session_factory) as db:
        item = items_service.share_item(db, env, alex.web(), space.id, "Oops", "Wrong thing")
    caller.as_user(alex.principal())
    async with connect(server, mode) as client:
        retracted = await client.call_tool("retract_item", {"item_id": item.id})
        context = await client.call_tool("get_space_context", {})

    assert retracted.is_error is not True
    assert "Retracted the item" in text_of(retracted)
    assert "Wrong thing" not in text_of(context)
    assert "Oops" not in text_of(context)


@pytest.mark.parametrize("mode", MODES)
async def test_only_the_sharer_can_retract_and_strangers_learn_nothing(
    server: MCPServer,
    caller: Caller,
    env: Env,
    session_factory: SessionFactory,
    alex: Person,
    blake: Person,
    make: Factory,
    mode: str,
) -> None:
    space = make.space(alex, "Goa trip", blake)
    carol = make.user("carol@example.com")
    with session_scope(session_factory) as db:
        item = items_service.share_item(db, env, alex.web(), space.id, "Mine", "Keep")
    async with connect(server, mode) as client:
        caller.as_user(blake.principal())
        by_member = await client.call_tool("retract_item", {"item_id": item.id})
        caller.as_user(carol.principal())
        by_stranger = await client.call_tool("retract_item", {"item_id": item.id})
        missing = await client.call_tool(
            "retract_item", {"item_id": "00000000-0000-0000-0000-000000000000"}
        )

    assert by_member.is_error is True
    assert "Only the person who shared an item can retract it." in text_of(by_member)
    assert by_stranger.is_error is True
    assert "Item not found." in text_of(by_stranger)
    assert "Item not found." in text_of(missing)
