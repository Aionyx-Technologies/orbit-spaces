from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver.exceptions import ToolError

from orbit.principal import Principal

CLIENT_NAME_CLAIM = "client_name"
DEFAULT_CLIENT_NAME = "Assistant"


def request_principal() -> Principal:
    token = get_access_token()
    if token is None or not token.subject:
        raise ToolError(
            "You are not signed in to Orbit. Reconnect the Orbit connector and try again."
        )
    claimed = (token.claims or {}).get(CLIENT_NAME_CLAIM)
    return Principal(
        user_id=token.subject,
        client_name=str(claimed) if claimed else DEFAULT_CLIENT_NAME,
    )
