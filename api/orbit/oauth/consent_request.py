from __future__ import annotations

from dataclasses import dataclass
from typing import Any

PURPOSE_CONSENT = "consent"
PURPOSE_CONSENT_CSRF = "consent-csrf"


@dataclass(frozen=True)
class ConsentRequest:
    client_id: str
    redirect_uri: str
    code_challenge: str
    state: str | None
    scopes: list[str]
    resource: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "c": self.client_id,
            "r": self.redirect_uri,
            "h": self.code_challenge,
            "s": self.state,
            "sc": self.scopes,
            "res": self.resource,
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> ConsentRequest | None:
        client_id = payload.get("c")
        redirect_uri = payload.get("r")
        challenge = payload.get("h")
        state = payload.get("s")
        scopes = payload.get("sc")
        resource = payload.get("res")
        if not (
            isinstance(client_id, str)
            and isinstance(redirect_uri, str)
            and isinstance(challenge, str)
            and isinstance(resource, str)
            and isinstance(scopes, list)
            and all(isinstance(scope, str) for scope in scopes)
            and (state is None or isinstance(state, str))
        ):
            return None
        return cls(
            client_id=client_id,
            redirect_uri=redirect_uri,
            code_challenge=challenge,
            state=state,
            scopes=list(scopes),
            resource=resource,
        )
