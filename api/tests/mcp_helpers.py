from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from mcp import Client
from mcp.server.mcpserver import MCPServer
from mcp_types import CallToolResult, TextContent

from orbit.db import SessionFactory
from orbit.mcp_server import McpDeps, build_mcp_server
from orbit.principal import Principal
from orbit.services.context import Env


@dataclass
class Caller:
    principal: Principal | None = None
    switch_log: list[str] = field(default_factory=list)

    def as_user(self, principal: Principal) -> None:
        self.principal = principal
        self.switch_log.append(principal.user_id)

    def resolve(self) -> Principal:
        assert self.principal is not None
        return self.principal


def build_test_server(env: Env, session_factory: SessionFactory, caller: Caller) -> MCPServer:
    return build_mcp_server(
        McpDeps(env=env, session_factory=session_factory, principal=caller.resolve)
    )


@asynccontextmanager
async def connect(server: MCPServer, mode: str) -> AsyncIterator[Client]:
    async with Client(server, mode=mode) as client:
        yield client


def text_of(result: CallToolResult) -> str:
    parts = [block.text for block in result.content if isinstance(block, TextContent)]
    return "\n".join(parts)


ToolCaller = Callable[[str, dict[str, object]], CallToolResult]
