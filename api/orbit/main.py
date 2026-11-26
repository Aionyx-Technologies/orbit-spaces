from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from datetime import datetime

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from mcp.server.auth.provider import ProviderTokenVerifier
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import Engine, text
from starlette.applications import Starlette

from orbit.accesslog import AccessLogMiddleware
from orbit.auth import demo as demo_routes
from orbit.auth import routes as auth_routes
from orbit.auth.deps import wants_json
from orbit.auth.mcp import request_principal
from orbit.background import start_background_tasks, stop_background_tasks
from orbit.billing import BillingGateway, StripeGateway
from orbit.bodylimit import PathBodyLimitMiddleware
from orbit.config import LOCAL_HOSTS, Settings
from orbit.db import (
    SessionFactory,
    create_db_engine,
    create_read_session_factory,
    create_session_factory,
    run_migrations,
    session_scope,
)
from orbit.email import EmailSender
from orbit.errors import OrbitError
from orbit.headers import ApiNoStoreMiddleware
from orbit.limits import AVATAR_BODY_MAX_BYTES, MAX_REQUEST_BODY_BYTES
from orbit.llm import AnthropicCombiner, AnthropicDrafter, Combiner, TemplateDrafter
from orbit.llm_gemini import GeminiCombiner, GeminiDrafter
from orbit.llm_openai import OpenAICombiner, OpenAIDrafter
from orbit.mcp_server import McpDeps, build_mcp_server
from orbit.oauth import consent as consent_routes
from orbit.oauth.cimd import DocumentFetcher, HttpDocumentFetcher
from orbit.oauth.provider import OrbitOAuthProvider
from orbit.oauth.routes import build_oauth_routes
from orbit.observability import init_error_tracking
from orbit.routes import build_api_router
from orbit.routes.billing import webhook_router
from orbit.runtime import Runtime
from orbit.services.context import Env
from orbit.space_templates import builtin_templates
from orbit.templating import page
from orbit.timeutil import utcnow

logger = logging.getLogger(__name__)


@dataclass
class Overrides:
    clock: Callable[[], datetime] | None = None
    sender: EmailSender | None = None
    fetcher: DocumentFetcher | None = None
    llm: Combiner | None = None
    drafter: TemplateDrafter | None = None
    billing: BillingGateway | None = None


def build_combiner(settings: Settings, override: Combiner | None) -> Combiner | None:
    if override is not None:
        return override
    if settings.combine_provider == "anthropic":
        return AnthropicCombiner(settings)
    if settings.combine_provider == "gemini":
        return GeminiCombiner(settings)
    if settings.combine_provider == "openai":
        return OpenAICombiner(settings)
    return None


def build_billing(settings: Settings, override: BillingGateway | None) -> BillingGateway | None:
    if override is not None:
        return override
    if settings.billing_enabled:
        return StripeGateway(settings)
    return None


def build_drafter(settings: Settings, override: TemplateDrafter | None) -> TemplateDrafter | None:
    if override is not None:
        return override
    if settings.combine_provider == "anthropic":
        return AnthropicDrafter(settings)
    if settings.combine_provider == "gemini":
        return GeminiDrafter(settings)
    if settings.combine_provider == "openai":
        return OpenAIDrafter(settings)
    return None


def _build_mcp(
    settings: Settings, env: Env, session_factory: SessionFactory, provider: OrbitOAuthProvider
) -> tuple[MCPServer, Starlette]:
    server = build_mcp_server(
        McpDeps(
            env=env,
            session_factory=session_factory,
            principal=request_principal,
            token_verifier=ProviderTokenVerifier(provider),
        )
    )
    app = server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=settings.transport_allowed_hosts,
            allowed_origins=settings.transport_allowed_origins,
        ),
    )
    return server, app


def _make_lifespan(
    *,
    settings: Settings,
    engine: Engine,
    env: Env,
    session_factory: SessionFactory,
    mcp_server: MCPServer,
    run_db_migrations: bool,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if run_db_migrations:
            await asyncio.to_thread(run_migrations, settings.database_url)
        async with mcp_server.session_manager.run():
            background = start_background_tasks(settings, env, session_factory)
            try:
                yield
            finally:
                await stop_background_tasks(background, env, session_factory)
        engine.dispose()

    return lifespan


def _register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(OrbitError)
    async def handle_orbit_error(request: Request, exc: OrbitError) -> Response:
        if request.url.path.startswith("/api/") or wants_json(request):
            return JSONResponse(
                {"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status
            )
        return page(
            "pages/error.html",
            status_code=exc.status,
            heading="That did not work",
            message=exc.message,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> Response:
        errors = exc.errors()
        message = str(errors[0].get("msg", "")) if errors else ""
        return JSONResponse(
            {
                "error": {
                    "code": "invalid_input",
                    "message": message or "That request was not valid.",
                }
            },
            status_code=422,
        )


def _warn_when_emails_would_only_be_logged(settings: Settings) -> None:
    if settings.smtp_configured or settings.resend_api_key:
        return
    if settings.base_hostname in LOCAL_HOSTS:
        return
    logger.warning(
        "Neither SMTP_HOST nor RESEND_API_KEY is set, so emails, including sign-in links, are "
        "printed to this log instead of being sent. Set one before inviting real people."
    )


def _warn_when_demo_mode_is_on(settings: Settings) -> None:
    if settings.demo_mode:
        logger.warning(
            "ORBIT_DEMO_MODE is on: anyone who can reach this server can sign in as the demo "
            "people without an email link. Use it only on your own machine."
        )


def _register_health(app: FastAPI, read_session_factory: SessionFactory) -> None:
    @app.get("/api/health")
    def health(response: Response) -> dict[str, str]:
        try:
            with session_scope(read_session_factory) as db:
                db.execute(text("SELECT 1"))
        except Exception:
            response.status_code = 503
            return {"status": "database_unavailable"}
        return {"status": "ok"}


def create_app(
    settings: Settings | None = None,
    *,
    run_db_migrations: bool = True,
    overrides: Overrides | None = None,
) -> FastAPI:
    settings = settings or Settings()
    settings.require_runtime()
    builtin_templates()
    init_error_tracking(settings)
    overrides = overrides or Overrides()
    _warn_when_emails_would_only_be_logged(settings)
    _warn_when_demo_mode_is_on(settings)
    engine = create_db_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    read_session_factory = create_read_session_factory(engine)
    env = Env(
        settings=settings,
        clock=overrides.clock or utcnow,
        sender=overrides.sender,
        llm=build_combiner(settings, overrides.llm),
        drafter=build_drafter(settings, overrides.drafter),
        billing=build_billing(settings, overrides.billing),
    )
    provider = OrbitOAuthProvider(session_factory, env, overrides.fetcher or HttpDocumentFetcher())
    mcp_server, mcp_app = _build_mcp(settings, env, session_factory, provider)

    app = FastAPI(
        title="Orbit",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=_make_lifespan(
            settings=settings,
            engine=engine,
            env=env,
            session_factory=session_factory,
            mcp_server=mcp_server,
            run_db_migrations=run_db_migrations,
        ),
    )
    app.state.runtime = Runtime(
        settings=settings,
        engine=engine,
        session_factory=session_factory,
        read_session_factory=read_session_factory,
        env=env,
        mcp=mcp_server,
        provider=provider,
    )
    app.add_middleware(ApiNoStoreMiddleware)
    app.add_middleware(
        PathBodyLimitMiddleware,
        default=MAX_REQUEST_BODY_BYTES,
        per_path={"/api/me/avatar": AVATAR_BODY_MAX_BYTES},
    )
    app.add_middleware(AccessLogMiddleware)
    _register_error_handlers(app)
    _register_health(app, read_session_factory)
    app.include_router(build_api_router())
    app.include_router(webhook_router)
    app.include_router(auth_routes.router)
    if settings.demo_mode:
        app.include_router(demo_routes.router)
    app.include_router(consent_routes.router)
    app.router.routes.extend(build_oauth_routes(provider, env))
    app.mount("/", mcp_app)
    return app
