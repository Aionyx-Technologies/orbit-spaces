from __future__ import annotations

from dataclasses import dataclass

from mcp.server.mcpserver import MCPServer
from sqlalchemy import Engine

from orbit.config import Settings
from orbit.db import SessionFactory
from orbit.oauth.provider import OrbitOAuthProvider
from orbit.services.context import Env


@dataclass
class Runtime:
    settings: Settings
    engine: Engine
    session_factory: SessionFactory
    read_session_factory: SessionFactory
    env: Env
    mcp: MCPServer
    provider: OrbitOAuthProvider
