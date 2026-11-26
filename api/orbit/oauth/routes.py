from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import timedelta

from mcp.server.auth.handlers.authorize import AuthorizationHandler
from mcp.server.auth.handlers.metadata import MetadataHandler, ProtectedResourceMetadataHandler
from mcp.server.auth.handlers.register import RegistrationHandler
from mcp.server.auth.handlers.revoke import RevocationHandler
from mcp.server.auth.handlers.token import TokenHandler
from mcp.server.auth.middleware.client_auth import ClientAuthenticator
from mcp.server.auth.settings import ClientRegistrationOptions
from mcp.server.transport_security import DEFAULT_MAX_REQUEST_BODY_SIZE, RequestBodyLimitMiddleware
from mcp.shared.inbound import MCP_PROTOCOL_VERSION_HEADER
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route, request_response
from starlette.types import ASGIApp

from orbit.limits import AUTHORIZE_PER_IP, OAUTH_SCOPE, REGISTRATION_PER_IP
from orbit.oauth.metadata import authorization_server_metadata, protected_resource_metadata
from orbit.oauth.provider import OrbitOAuthProvider
from orbit.security import rate_limit_address
from orbit.services.context import Env

Handler = Callable[[Request], Awaitable[Response]]


def _cors(app: ASGIApp, methods: list[str]) -> ASGIApp:
    return CORSMiddleware(
        app=app,
        allow_origins="*",
        allow_methods=methods,
        allow_headers=[MCP_PROTOCOL_VERSION_HEADER],
    )


def _limited_body(handler: Handler) -> ASGIApp:
    return RequestBodyLimitMiddleware(request_response(handler), DEFAULT_MAX_REQUEST_BODY_SIZE)


def _rate_limited_per_ip(
    handler: Handler, env: Env, key: str, limit: tuple[int, timedelta], description: str
) -> Handler:
    async def limited(request: Request) -> Response:
        address = rate_limit_address(request.client.host if request.client else "unknown")
        if not env.limiter.allow(f"{key}:{address}", limit):
            return JSONResponse(
                {"error": "temporarily_unavailable", "error_description": description},
                status_code=429,
            )
        return await handler(request)

    return limited


def build_oauth_routes(provider: OrbitOAuthProvider, env: Env) -> list[Route]:
    settings = env.settings
    authenticator = ClientAuthenticator(provider)
    registration = RegistrationHandler(
        provider,
        options=ClientRegistrationOptions(
            enabled=True, valid_scopes=[OAUTH_SCOPE], default_scopes=[OAUTH_SCOPE]
        ),
    )
    token = TokenHandler(provider, authenticator)
    revocation = RevocationHandler(provider, authenticator)
    authorization = AuthorizationHandler(provider)
    server_metadata = MetadataHandler(authorization_server_metadata(settings))
    resource_metadata = ProtectedResourceMetadataHandler(protected_resource_metadata(settings))
    read_methods = ["GET", "OPTIONS"]
    post_methods = ["POST", "OPTIONS"]
    return [
        Route(
            "/.well-known/oauth-authorization-server",
            endpoint=_cors(request_response(server_metadata.handle), read_methods),
            methods=read_methods,
        ),
        Route(
            "/.well-known/oauth-protected-resource",
            endpoint=_cors(request_response(resource_metadata.handle), read_methods),
            methods=read_methods,
        ),
        Route(
            "/oauth/authorize",
            endpoint=_limited_body(
                _rate_limited_per_ip(
                    authorization.handle,
                    env,
                    "authorize",
                    AUTHORIZE_PER_IP,
                    "Too many connection attempts from this address. Try later.",
                )
            ),
            methods=["GET", "POST"],
        ),
        Route(
            "/oauth/token",
            endpoint=_cors(_limited_body(token.handle), post_methods),
            methods=post_methods,
        ),
        Route(
            "/oauth/register",
            endpoint=_cors(
                _limited_body(
                    _rate_limited_per_ip(
                        registration.handle,
                        env,
                        "register",
                        REGISTRATION_PER_IP,
                        "Too many registrations from this address. Try later.",
                    )
                ),
                post_methods,
            ),
            methods=post_methods,
        ),
        Route(
            "/oauth/revoke",
            endpoint=_cors(_limited_body(revocation.handle), post_methods),
            methods=post_methods,
        ),
    ]
