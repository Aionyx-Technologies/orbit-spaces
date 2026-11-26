from __future__ import annotations

import re
from urllib.parse import urlparse

LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
PRIVATE_USE_SCHEME = re.compile(r"^[a-z][a-z0-9-]{0,40}(\.[a-z0-9-]{1,40}){1,8}$")
MAX_REDIRECT_URI_LENGTH = 2048


class InvalidRedirectUri(ValueError):
    pass


def validate_redirect_uri(uri: str) -> str:
    if not uri or len(uri) > MAX_REDIRECT_URI_LENGTH or any(ord(ch) < 0x20 for ch in uri):
        raise InvalidRedirectUri("Redirect URIs must be short single-line URLs.")
    parsed = urlparse(uri)
    scheme = parsed.scheme.lower()
    if not scheme:
        raise InvalidRedirectUri("Redirect URIs must be absolute.")
    if parsed.fragment:
        raise InvalidRedirectUri("Redirect URIs must not contain a fragment.")
    if scheme == "https":
        if not parsed.hostname or parsed.username or parsed.password:
            raise InvalidRedirectUri("HTTPS redirect URIs need a host and no credentials.")
    elif scheme == "http":
        if parsed.hostname not in LOOPBACK_HOSTS:
            raise InvalidRedirectUri("Plain HTTP redirect URIs are only allowed for localhost.")
    elif not PRIVATE_USE_SCHEME.match(scheme):
        raise InvalidRedirectUri(
            "Custom redirect URI schemes must be written like com.example.app."
        )
    return uri


def name_matches_host(client_name: str, host: str) -> bool:
    """True when a word of the client's chosen name appears in where it returns to.

    The name is written by whoever registered the client, so it proves nothing.
    A name that shares nothing with the address is a sign someone borrowed a
    well-known name, and the consent page warns about it.
    """
    haystack = re.sub(r"[^a-z0-9]", "", host.lower())
    words = [word for word in re.split(r"[^a-z0-9]+", client_name.lower()) if len(word) >= 3]
    return any(word in haystack for word in words)


def redirect_host(uris: list[str]) -> str:
    if not uris:
        return "the assistant"
    parsed = urlparse(uris[0])
    if parsed.scheme in {"http", "https"} and parsed.hostname:
        return parsed.hostname
    return f"{parsed.scheme}://"
