from __future__ import annotations

from collections.abc import Mapping

from mcp.server.transport_security import RequestBodyLimitMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class PathBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, default: int, per_path: Mapping[str, int]) -> None:
        self._default = RequestBodyLimitMiddleware(app, default)
        self._special = {
            path: RequestBodyLimitMiddleware(app, size) for path, size in per_path.items()
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            await self._special.get(scope["path"], self._default)(scope, receive, send)
            return
        await self._default(scope, receive, send)
