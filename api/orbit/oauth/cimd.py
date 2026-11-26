from __future__ import annotations

import asyncio
import ipaddress
import json
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

from orbit.errors import OrbitError
from orbit.limits import CLIENT_NAME_MAX, MAX_REDIRECT_URIS
from orbit.oauth.redirects import InvalidRedirectUri, validate_redirect_uri
from orbit.text import clean_single_line

MAX_DOCUMENT_BYTES = 64 * 1024
FETCH_TIMEOUT_SECONDS = 5.0
FETCH_DEADLINE_SECONDS = 8.0
MAX_CONCURRENT_FETCHES = 4
MAX_CLIENT_ID_LENGTH = 512
CHUNK_BYTES = 8192

Resolver = Callable[[str, int], Awaitable[list[str]]]
ClientFactory = Callable[[], httpx.AsyncClient]


class CimdError(Exception):
    pass


class DocumentFetcher(Protocol):
    async def fetch(self, url: str) -> dict[str, Any]: ...


@dataclass(frozen=True)
class ClientDocument:
    client_id: str
    client_name: str
    redirect_uris: list[str]


async def resolve_addresses(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return sorted({str(info[4][0]) for info in infos})


EMBEDDED_IPV4_NETWORKS = (
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("64:ff9b:1::/48"),
    ipaddress.ip_network("2002::/16"),
    ipaddress.ip_network("2001::/32"),
)
DEPRECATED_NETWORKS = (
    ipaddress.ip_network("fec0::/10"),
    ipaddress.ip_network("192.88.99.0/24"),
)
UNSAFE_NETWORKS = (*EMBEDDED_IPV4_NETWORKS, *DEPRECATED_NETWORKS)


def _is_routable(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return _is_routable(ip.ipv4_mapped)
    if any(ip in network for network in UNSAFE_NETWORKS):
        return False
    return ip.is_global and not (
        ip.is_multicast or ip.is_reserved or ip.is_unspecified or ip.is_loopback or ip.is_link_local
    )


def is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    return _is_routable(ip)


def is_client_metadata_url(client_id: str) -> bool:
    try:
        parse_client_metadata_url(client_id)
    except CimdError:
        return False
    return True


def parse_client_metadata_url(url: str) -> tuple[str, int, str]:
    if not url or len(url) > MAX_CLIENT_ID_LENGTH or any(ord(ch) < 0x21 for ch in url):
        raise CimdError("The client id is not a usable URL.")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise CimdError("Client metadata documents must be served over HTTPS.")
    if parsed.username or parsed.password or parsed.fragment:
        raise CimdError("The client id must not contain credentials or a fragment.")
    if parsed.path in {"", "/"}:
        raise CimdError("The client id needs a path.")
    segments = parsed.path.split("/")
    if "." in segments or ".." in segments:
        raise CimdError("The client id must not contain dot segments.")
    try:
        port = parsed.port or 443
    except ValueError as exc:
        raise CimdError("The client id has an invalid port.") from exc
    target = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    return parsed.hostname, port, target


def _require_list_containing(document: dict[str, Any], key: str, default: str, label: str) -> None:
    values = document.get(key, [default])
    if not isinstance(values, list) or default not in values:
        raise CimdError(f"The document must allow {label}.")


def _checked_redirect_uris(document: dict[str, Any]) -> list[str]:
    uris = document.get("redirect_uris")
    if not isinstance(uris, list) or not uris or len(uris) > MAX_REDIRECT_URIS:
        raise CimdError("The document needs between 1 and 10 redirect_uris.")
    if not all(isinstance(uri, str) for uri in uris):
        raise CimdError("Every redirect URI must be a string.")
    try:
        return [validate_redirect_uri(uri) for uri in uris]
    except InvalidRedirectUri as exc:
        raise CimdError(str(exc)) from exc


def _display_name(document: dict[str, Any], fallback: str) -> str:
    raw_name = document.get("client_name")
    if not isinstance(raw_name, str) or not raw_name.strip():
        return fallback
    try:
        return clean_single_line(raw_name, "Client name", CLIENT_NAME_MAX)
    except OrbitError:
        return fallback


def _supports_public_auth(document: dict[str, Any]) -> bool:
    """True when the client can act as a public client, authenticating with PKCE alone.

    Some clients, ChatGPT among them, prefer private_key_jwt but also list "none"
    in token_endpoint_auth_methods_supported. Orbit only advertises "none" for
    these clients, so they fall back to it.
    """
    if document.get("token_endpoint_auth_method", "none") == "none":
        return True
    supported = document.get("token_endpoint_auth_methods_supported")
    return isinstance(supported, list) and "none" in supported


def validate_client_document(url: str, document: dict[str, Any]) -> ClientDocument:
    if document.get("client_id") != url:
        raise CimdError("The document's client_id does not match the URL it was served from.")
    if not _supports_public_auth(document):
        raise CimdError("Only public clients are supported for client metadata documents.")
    _require_list_containing(
        document, "grant_types", "authorization_code", "the authorization_code grant"
    )
    _require_list_containing(document, "response_types", "code", "the code response type")
    return ClientDocument(
        client_id=url,
        client_name=_display_name(document, urlparse(url).hostname or "Assistant"),
        redirect_uris=_checked_redirect_uris(document),
    )


class HttpDocumentFetcher:
    def __init__(
        self,
        resolver: Resolver = resolve_addresses,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._resolver = resolver
        self._client_factory = client_factory or self._default_client
        self._slots = asyncio.Semaphore(MAX_CONCURRENT_FETCHES)

    @staticmethod
    def _default_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False, trust_env=False
        )

    async def fetch(self, url: str) -> dict[str, Any]:
        host, port, target = parse_client_metadata_url(url)
        try:
            async with asyncio.timeout(FETCH_DEADLINE_SECONDS), self._slots:
                return await self._fetch_document(host, port, target)
        except TimeoutError as exc:
            raise CimdError("The client metadata document took too long to fetch.") from exc

    async def _fetch_document(self, host: str, port: int, target: str) -> dict[str, Any]:
        try:
            addresses = await self._resolver(host, port)
        except OSError as exc:
            raise CimdError("The client's host could not be resolved.") from exc
        if not addresses or not all(is_public_address(address) for address in addresses):
            raise CimdError("The client's host is not a public address.")
        address = addresses[0]
        literal = f"[{address}]" if ":" in address else address
        host_header = host if port == 443 else f"{host}:{port}"
        headers = {
            "Host": host_header,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "Orbit-OAuth/1",
        }
        try:
            async with (
                self._client_factory() as client,
                client.stream(
                    "GET",
                    f"https://{literal}:{port}{target}",
                    headers=headers,
                    extensions={"sni_hostname": host},
                ) as response,
            ):
                if response.status_code != 200:
                    raise CimdError(f"The client metadata URL answered {response.status_code}.")
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise CimdError("The client metadata document must not be compressed.")
                body = await _read_limited(response)
        except httpx.HTTPError as exc:
            raise CimdError("The client metadata document could not be fetched.") from exc
        try:
            document = json.loads(body)
        except ValueError as exc:
            raise CimdError("The client metadata document is not valid JSON.") from exc
        if not isinstance(document, dict):
            raise CimdError("The client metadata document must be a JSON object.")
        return document


async def _read_limited(response: httpx.Response) -> bytes:
    received = bytearray()
    async for chunk in response.aiter_bytes(CHUNK_BYTES):
        received.extend(chunk)
        if len(received) > MAX_DOCUMENT_BYTES:
            raise CimdError("The client metadata document is too large.")
    return bytes(received)
