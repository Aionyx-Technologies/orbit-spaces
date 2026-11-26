from __future__ import annotations

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("orbit.access")

FIXED_PATHS = frozenset(
    {
        "/mcp",
        "/oauth/authorize",
        "/oauth/token",
        "/oauth/register",
        "/oauth/revoke",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
    }
)
UNMATCHED = "(unmatched)"


def _with_router_prefix(scope: Scope, template: str) -> str:
    path = str(scope.get("path", ""))
    params = scope.get("path_params") or {}
    try:
        concrete = template.format(**params)
    except (KeyError, IndexError, ValueError):
        return template
    if len(path) > len(concrete) and path.endswith(concrete):
        return path[: len(path) - len(concrete)] + template
    return template


def route_label(scope: Scope) -> str:
    route = scope.get("route")
    template = getattr(route, "path_format", None) or getattr(route, "path", None)
    if template:
        return _with_router_prefix(scope, str(template))
    path = str(scope.get("path", ""))
    return path if path in FIXED_PATHS else UNMATCHED


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            logger.info(
                "%s %s %d %.0fms",
                scope.get("method", "?"),
                route_label(scope),
                status,
                (time.perf_counter() - started) * 1000,
            )
