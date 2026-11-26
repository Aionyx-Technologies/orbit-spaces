from __future__ import annotations

from mcp.shared.auth import OAuthMetadata, ProtectedResourceMetadata

from orbit.config import Settings
from orbit.limits import OAUTH_SCOPE

CLIENT_AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"]


def authorization_server_metadata(settings: Settings) -> OAuthMetadata:
    base = settings.base_url
    return OAuthMetadata.model_validate(
        {
            "issuer": base,
            "authorization_endpoint": f"{base}/oauth/authorize",
            "token_endpoint": f"{base}/oauth/token",
            "registration_endpoint": f"{base}/oauth/register",
            "revocation_endpoint": f"{base}/oauth/revoke",
            "scopes_supported": [OAUTH_SCOPE],
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "token_endpoint_auth_methods_supported": CLIENT_AUTH_METHODS,
            "revocation_endpoint_auth_methods_supported": CLIENT_AUTH_METHODS,
            "code_challenge_methods_supported": ["S256"],
            "client_id_metadata_document_supported": True,
            "authorization_response_iss_parameter_supported": True,
        }
    )


def protected_resource_metadata(settings: Settings) -> ProtectedResourceMetadata:
    return ProtectedResourceMetadata.model_validate(
        {
            "resource": settings.mcp_url,
            "authorization_servers": [settings.base_url],
            "scopes_supported": [OAUTH_SCOPE],
            "resource_name": "Orbit",
        }
    )
