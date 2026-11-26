from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, TypeVar
from urllib.parse import quote, urlparse

import anyio.to_thread
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    IdentityAssertionParams,
    RefreshToken,
    RegistrationError,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyHttpUrl, ValidationError
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from orbit import models
from orbit.db import SessionFactory, rows_affected, session_scope
from orbit.errors import OrbitError
from orbit.limits import (
    ACCESS_TOKEN_TTL,
    AUTH_CODE_TTL,
    CIMD_CACHE_TTL,
    CLIENT_NAME_MAX,
    MAX_REDIRECT_URIS,
    OAUTH_SCOPE,
    REFRESH_TOKEN_TTL,
)
from orbit.oauth.cimd import (
    CimdError,
    DocumentFetcher,
    is_client_metadata_url,
    validate_client_document,
)
from orbit.oauth.consent_request import PURPOSE_CONSENT, ConsentRequest
from orbit.oauth.redirects import InvalidRedirectUri, redirect_host, validate_redirect_uri
from orbit.security import hash_token, new_token
from orbit.services.context import Env
from orbit.text import clean_single_line

logger = logging.getLogger("orbit.oauth")

T = TypeVar("T")

REGISTRY_CIMD = "cimd"
REGISTRY_DCR = "dcr"
SECRET_AUTH_METHODS = frozenset({"client_secret_post", "client_secret_basic"})
SUPPORTED_AUTH_METHODS = frozenset({"none", *SECRET_AUTH_METHODS})
KEPT_REGISTRATION_FIELDS = (
    "grant_types",
    "response_types",
    "token_endpoint_auth_method",
    "scope",
    "application_type",
    "software_id",
    "software_version",
)
ClientRow = models.OAuthClient


def same_resource(left: str | None, right: str) -> bool:
    if left is None:
        return False
    try:
        normalised = str(AnyHttpUrl(left))
    except ValidationError:
        return False
    return normalised.removesuffix("/") == right.removesuffix("/")


class OrbitOAuthProvider:
    def __init__(self, session_factory: SessionFactory, env: Env, fetcher: DocumentFetcher) -> None:
        self._session_factory = session_factory
        self._env = env
        self._fetcher = fetcher

    async def _run(self, work: Callable[[Session], T]) -> T:
        def runner() -> T:
            with session_scope(self._session_factory) as db:
                return work(db)

        return await anyio.to_thread.run_sync(runner)

    def _client_info(self, row: ClientRow) -> OAuthClientInformationFull:
        stored = {key: value for key, value in row.metadata_json.items() if key != "fetched_at"}
        secret = None
        if stored.get("token_endpoint_auth_method") in SECRET_AUTH_METHODS:
            secret = self._env.signer.derive_client_secret(row.client_id)
        return OAuthClientInformationFull.model_validate(
            {
                **stored,
                "client_id": row.client_id,
                "client_name": row.client_name,
                "redirect_uris": row.redirect_uris,
                "client_secret": secret,
            }
        )

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        if is_client_metadata_url(client_id):
            return await self._get_cimd_client(client_id)

        def load(db: Session) -> OAuthClientInformationFull | None:
            row = db.get(ClientRow, client_id)
            if row is None or row.registration_type != REGISTRY_DCR:
                return None
            return self._client_info(row)

        return await self._run(load)

    async def _get_cimd_client(self, client_id: str) -> OAuthClientInformationFull | None:
        now = self._env.now()
        cached = await self._run(lambda db: self._cached_cimd(db, client_id, now))
        if cached is not None and cached[1]:
            return cached[0]
        try:
            document = validate_client_document(client_id, await self._fetcher.fetch(client_id))
        except (CimdError, OrbitError) as exc:
            logger.warning("Could not use client metadata document: %s", exc)
            return cached[0] if cached is not None else None
        except Exception:
            logger.warning("Fetching a client metadata document failed unexpectedly.")
            return cached[0] if cached is not None else None

        def store(db: Session) -> OAuthClientInformationFull:
            row = db.get(ClientRow, client_id)
            metadata: dict[str, Any] = {
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "scope": OAUTH_SCOPE,
                "fetched_at": now.isoformat(),
            }
            if row is None:
                row = ClientRow(
                    client_id=client_id,
                    client_name=document.client_name,
                    redirect_uris=document.redirect_uris,
                    registration_type=REGISTRY_CIMD,
                    metadata_json=metadata,
                    created_at=now,
                )
                db.add(row)
            else:
                row.client_name = document.client_name
                row.redirect_uris = document.redirect_uris
                row.metadata_json = metadata
            db.commit()
            return self._client_info(row)

        return await self._run(store)

    def _cached_cimd(
        self, db: Session, client_id: str, now: datetime
    ) -> tuple[OAuthClientInformationFull, bool] | None:
        row = db.get(ClientRow, client_id)
        if row is None or row.registration_type != REGISTRY_CIMD:
            return None
        fetched_raw = row.metadata_json.get("fetched_at")
        fresh = False
        if isinstance(fetched_raw, str):
            try:
                fresh = now - datetime.fromisoformat(fetched_raw) < CIMD_CACHE_TTL
            except ValueError:
                fresh = False
        return self._client_info(row), fresh

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        uris = [str(uri) for uri in client_info.redirect_uris or []]
        if not uris or len(uris) > MAX_REDIRECT_URIS:
            raise RegistrationError(
                "invalid_redirect_uri", f"Provide between 1 and {MAX_REDIRECT_URIS} redirect URIs."
            )
        try:
            cleaned_uris = [validate_redirect_uri(uri) for uri in uris]
        except InvalidRedirectUri as exc:
            raise RegistrationError("invalid_redirect_uri", str(exc)) from exc
        method = client_info.token_endpoint_auth_method or "none"
        if method not in SUPPORTED_AUTH_METHODS:
            raise RegistrationError(
                "invalid_client_metadata", "That token_endpoint_auth_method is not supported."
            )
        name = _registration_name(client_info.client_name, cleaned_uris)
        client_info.client_name = name
        client_info.client_secret = (
            self._env.signer.derive_client_secret(client_info.client_id)
            if method in SECRET_AUTH_METHODS
            else None
        )
        dumped = client_info.model_dump(mode="json", exclude_none=True)
        metadata = {key: dumped[key] for key in KEPT_REGISTRATION_FIELDS if key in dumped}
        now = self._env.now()

        def store(db: Session) -> None:
            db.add(
                ClientRow(
                    client_id=client_info.client_id,
                    client_name=name,
                    redirect_uris=cleaned_uris,
                    registration_type=REGISTRY_DCR,
                    metadata_json=metadata,
                    created_at=now,
                )
            )
            db.commit()

        await self._run(store)

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        settings = self._env.settings
        if not params.redirect_uri_provided_explicitly:
            raise AuthorizeError("invalid_request", "redirect_uri is required.")
        if params.resource is None:
            raise AuthorizeError(
                "invalid_target", f"The resource parameter is required. Use {settings.mcp_url}."
            )
        if not same_resource(params.resource, settings.mcp_url):
            raise AuthorizeError(
                "invalid_target", f"This server only issues tokens for {settings.mcp_url}."
            )
        scopes = params.scopes or [OAUTH_SCOPE]
        if any(scope != OAUTH_SCOPE for scope in scopes):
            raise AuthorizeError("invalid_scope", f"The only supported scope is {OAUTH_SCOPE}.")
        request = ConsentRequest(
            client_id=client.client_id,
            redirect_uri=str(params.redirect_uri),
            code_challenge=params.code_challenge,
            state=params.state,
            scopes=scopes,
            resource=settings.mcp_url,
        )
        signed = self._env.signer.sign(request.to_payload(), PURPOSE_CONSENT)
        return f"{settings.base_url}/oauth/consent?request={quote(signed, safe='')}"

    async def issue_code(self, user_id: str, request: ConsentRequest) -> str:
        code = new_token(32)
        now = self._env.now()

        def store(db: Session) -> None:
            db.add(
                models.OAuthCode(
                    code_hash=hash_token(code),
                    client_id=request.client_id,
                    user_id=user_id,
                    redirect_uri=request.redirect_uri,
                    code_challenge=request.code_challenge,
                    resource=request.resource,
                    scopes=request.scopes,
                    expires_at=now + AUTH_CODE_TTL,
                    used_at=None,
                )
            )
            db.commit()

        await self._run(store)
        return code

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        digest = hash_token(authorization_code)

        def load(db: Session) -> AuthorizationCode | None:
            row = db.get(models.OAuthCode, digest)
            if row is None or row.client_id != client.client_id or row.used_at is not None:
                return None
            return AuthorizationCode(
                code=authorization_code,
                scopes=row.scopes,
                expires_at=row.expires_at.timestamp(),
                client_id=row.client_id,
                code_challenge=row.code_challenge,
                redirect_uri=row.redirect_uri,
                redirect_uri_provided_explicitly=True,
                resource=row.resource,
                subject=row.user_id,
            )

        return await self._run(load)

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        digest = hash_token(authorization_code.code)
        now = self._env.now()

        def exchange(db: Session) -> OAuthToken:
            claimed = db.execute(
                update(models.OAuthCode)
                .where(
                    models.OAuthCode.code_hash == digest,
                    models.OAuthCode.used_at.is_(None),
                    models.OAuthCode.expires_at > now,
                )
                .values(used_at=now)
            )
            if rows_affected(claimed) != 1 or authorization_code.subject is None:
                db.rollback()
                raise TokenError("invalid_grant", "The authorization code was already used.")
            tokens = self._issue_tokens(
                db,
                client.client_id,
                authorization_code.subject,
                authorization_code.scopes,
                authorization_code.resource,
                now,
            )
            db.commit()
            return tokens

        return await self._run(exchange)

    def _issue_tokens(
        self,
        db: Session,
        client_id: str,
        user_id: str,
        scopes: list[str],
        resource: str | None,
        now: datetime,
    ) -> OAuthToken:
        access = new_token(32)
        refresh = new_token(48)
        db.add(
            models.OAuthToken(
                access_hash=hash_token(access),
                refresh_hash=hash_token(refresh),
                client_id=client_id,
                user_id=user_id,
                scopes=scopes,
                resource=resource,
                access_expires_at=now + ACCESS_TOKEN_TTL,
                refresh_expires_at=now + REFRESH_TOKEN_TTL,
                revoked_at=None,
                created_at=now,
            )
        )
        return OAuthToken(
            access_token=access,
            expires_in=int(ACCESS_TOKEN_TTL.total_seconds()),
            scope=" ".join(scopes),
            refresh_token=refresh,
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        digest = hash_token(refresh_token)
        now = self._env.now()

        def load(db: Session) -> RefreshToken | None:
            row = db.scalar(
                select(models.OAuthToken).where(models.OAuthToken.refresh_hash == digest)
            )
            if row is None or row.client_id != client.client_id:
                return None
            if row.revoked_at is not None:
                self._revoke_family(db, row.client_id, row.user_id, now)
                db.commit()
                return None
            if row.refresh_expires_at <= now:
                return None
            return RefreshToken(
                token=refresh_token,
                client_id=row.client_id,
                scopes=row.scopes,
                expires_at=int(row.refresh_expires_at.timestamp()),
                resource=row.resource,
                subject=row.user_id,
            )

        return await self._run(load)

    def _revoke_family(self, db: Session, client_id: str, user_id: str, now: datetime) -> None:
        db.execute(
            update(models.OAuthToken)
            .where(
                models.OAuthToken.client_id == client_id,
                models.OAuthToken.user_id == user_id,
                models.OAuthToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        digest = hash_token(refresh_token.token)
        now = self._env.now()

        def rotate(db: Session) -> OAuthToken:
            claimed = db.execute(
                update(models.OAuthToken)
                .where(
                    models.OAuthToken.refresh_hash == digest,
                    models.OAuthToken.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
            if rows_affected(claimed) != 1 or refresh_token.subject is None:
                db.rollback()
                raise TokenError("invalid_grant", "The refresh token was already used.")
            tokens = self._issue_tokens(
                db,
                client.client_id,
                refresh_token.subject,
                scopes or refresh_token.scopes,
                refresh_token.resource,
                now,
            )
            db.commit()
            return tokens

        return await self._run(rotate)

    async def load_access_token(self, token: str) -> AccessToken | None:
        digest = hash_token(token)
        now = self._env.now()

        def load(db: Session) -> AccessToken | None:
            row = db.execute(
                select(models.OAuthToken, ClientRow.client_name)
                .join(ClientRow, ClientRow.client_id == models.OAuthToken.client_id)
                .where(
                    models.OAuthToken.access_hash == digest,
                    models.OAuthToken.revoked_at.is_(None),
                    models.OAuthToken.access_expires_at > now,
                )
            ).first()
            if row is None:
                return None
            token_row, client_name = row
            return AccessToken(
                token=token,
                client_id=token_row.client_id,
                scopes=token_row.scopes,
                expires_at=int(token_row.access_expires_at.timestamp()),
                resource=token_row.resource,
                subject=token_row.user_id,
                claims={"client_name": client_name},
            )

        return await self._run(load)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        digest = hash_token(token.token)
        now = self._env.now()

        def revoke(db: Session) -> None:
            db.execute(
                update(models.OAuthToken)
                .where(
                    or_(
                        models.OAuthToken.access_hash == digest,
                        models.OAuthToken.refresh_hash == digest,
                    ),
                    models.OAuthToken.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
            db.commit()

        await self._run(revoke)

    async def exchange_identity_assertion(
        self, client: OAuthClientInformationFull, params: IdentityAssertionParams
    ) -> OAuthToken:
        raise TokenError(
            "unsupported_grant_type", "The JWT bearer grant is not supported by this server."
        )


def _registration_name(raw: str | None, redirect_uris: list[str]) -> str:
    if raw and raw.strip():
        try:
            return clean_single_line(raw, "Client name", CLIENT_NAME_MAX)
        except OrbitError:
            pass
    host = urlparse(redirect_uris[0]).hostname
    return host or redirect_host(redirect_uris)
