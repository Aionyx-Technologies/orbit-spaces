from __future__ import annotations

import asyncio
import gzip
import json
import zlib
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from orbit.oauth import cimd as cimd_module
from orbit.oauth.cimd import (
    MAX_DOCUMENT_BYTES,
    CimdError,
    HttpDocumentFetcher,
    is_client_metadata_url,
    is_public_address,
    parse_client_metadata_url,
    validate_client_document,
)

pytestmark = pytest.mark.anyio

URL = "https://client.example/oauth/metadata.json"
PUBLIC_V4 = "93.184.216.34"
PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946"


def good_document(**overrides: Any) -> dict[str, Any]:
    document: dict[str, Any] = {
        "client_id": URL,
        "client_name": "Grok",
        "redirect_uris": ["https://grok.test/callback"],
        "token_endpoint_auth_method": "none",
    }
    document.update(overrides)
    return document


def resolver_for(*addresses: str) -> Callable[[str, int], Any]:
    async def resolve(host: str, port: int) -> list[str]:
        return list(addresses)

    return resolve


def fetcher_with(
    handler: Callable[[httpx.Request], httpx.Response], *addresses: str
) -> HttpDocumentFetcher:
    transport = httpx.MockTransport(handler)
    return HttpDocumentFetcher(
        resolver=resolver_for(*(addresses or (PUBLIC_V4,))),
        client_factory=lambda: httpx.AsyncClient(transport=transport),
    )


def json_response(payload: Any, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, headers={"content-type": "application/json"})


@pytest.mark.parametrize(
    "address", [PUBLIC_V4, "8.8.8.8", "1.1.1.1", PUBLIC_V6, "2001:4860:4860::8888"]
)
def test_public_addresses_are_allowed(address: str) -> None:
    assert is_public_address(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "fe80::1",
        "fc00::1",
        "::ffff:10.0.0.1",
        "::ffff:127.0.0.1",
        "64:ff9b::a00:1",
        "2002:a00:1::1",
        "2001:0:4136:e378:8000:63bf:3fff:fdd2",
        "fec0::1",
        "192.88.99.1",
        "ff02::1",
        "not-an-ip",
        "",
    ],
)
def test_private_and_reserved_addresses_are_blocked(address: str) -> None:
    assert is_public_address(address) is False


def test_a_normal_client_id_url_is_accepted() -> None:
    assert parse_client_metadata_url("https://client.example:8443/a/b.json?v=1") == (
        "client.example",
        8443,
        "/a/b.json?v=1",
    )
    assert is_client_metadata_url(URL) is True


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "http://client.example/metadata.json",
        "https://client.example",
        "https://client.example/",
        "https://user:pass@client.example/metadata.json",
        "https://client.example/metadata.json#frag",
        "https://client.example/a/../b",
        "https://client.example/a/./b",
        "https://client.example/ spaced",
        "https://client.example:99999/metadata.json",
        "https://client.example/" + "a" * 600,
        "c3f1b8a0-0000-4000-8000-000000000000",
    ],
)
def test_unusable_client_id_urls_are_rejected(bad: str) -> None:
    assert is_client_metadata_url(bad) is False


def test_a_good_document_is_accepted_and_cleaned() -> None:
    document = validate_client_document(URL, good_document(client_name="  Grok\n 2 "))

    assert document.client_name == "Grok 2"
    assert document.redirect_uris == ["https://grok.test/callback"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"client_id": "https://client.example/other.json"},
        {"token_endpoint_auth_method": "client_secret_post"},
        {"token_endpoint_auth_method": "private_key_jwt"},
        {
            "token_endpoint_auth_method": "private_key_jwt",
            "token_endpoint_auth_methods_supported": ["private_key_jwt"],
        },
        {
            "token_endpoint_auth_method": "private_key_jwt",
            "token_endpoint_auth_methods_supported": "none",
        },
        {"grant_types": ["client_credentials"]},
        {"response_types": ["token"]},
        {"redirect_uris": []},
        {"redirect_uris": "https://grok.test/callback"},
        {"redirect_uris": [1234]},
        {"redirect_uris": ["http://evil.example/cb"]},
        {"redirect_uris": ["javascript:alert(1)"]},
        {"redirect_uris": [f"https://x.example/{n}" for n in range(11)]},
    ],
)
def test_unsafe_documents_are_rejected(overrides: dict[str, Any]) -> None:
    unsafe = good_document(**overrides)

    with pytest.raises(CimdError):
        validate_client_document(URL, unsafe)


def test_a_client_that_prefers_another_method_but_supports_none_is_accepted() -> None:
    # The shape of https://chatgpt.com/oauth/client.json.
    document = validate_client_document(
        URL,
        good_document(
            client_name="ChatGPT",
            token_endpoint_auth_method="private_key_jwt",
            token_endpoint_auth_methods_supported=["none", "private_key_jwt"],
            grant_types=["authorization_code", "refresh_token"],
        ),
    )

    assert document.client_name == "ChatGPT"


def test_a_missing_name_falls_back_to_the_host() -> None:
    document = good_document()
    del document["client_name"]

    assert validate_client_document(URL, document).client_name == "client.example"


async def test_the_fetch_connects_to_the_checked_ip_but_names_the_real_host() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return json_response(good_document())

    document = await fetcher_with(handler).fetch(URL)

    assert document["client_name"] == "Grok"
    request = seen[0]
    assert request.url.host == PUBLIC_V4
    assert request.url.path == "/oauth/metadata.json"
    assert request.headers["host"] == "client.example"
    assert request.extensions["sni_hostname"] == "client.example"


async def test_an_ipv6_address_is_written_as_a_bracketed_literal() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return json_response(good_document())

    await fetcher_with(handler, PUBLIC_V6).fetch(URL)

    assert seen[0].url.host == PUBLIC_V6


async def test_a_non_default_port_is_kept_in_the_host_header() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return json_response(good_document())

    await fetcher_with(handler).fetch("https://client.example:8443/metadata.json")

    assert seen[0].headers["host"] == "client.example:8443"
    assert seen[0].url.port == 8443


@pytest.mark.parametrize(
    "addresses",
    [
        ("10.0.0.5",),
        ("127.0.0.1",),
        ("169.254.169.254",),
        (PUBLIC_V4, "10.0.0.5"),
        (),
    ],
)
async def test_a_host_that_resolves_to_a_private_address_is_never_contacted(
    addresses: tuple[str, ...],
) -> None:
    contacted: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        contacted.append(request)
        return json_response(good_document())

    fetcher = HttpDocumentFetcher(
        resolver=resolver_for(*addresses),
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)

    assert contacted == []


async def test_a_resolution_failure_is_reported_as_a_fetch_error() -> None:
    async def failing(host: str, port: int) -> list[str]:
        raise OSError("no such host")

    fetcher = HttpDocumentFetcher(resolver=failing)

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)


async def test_redirects_are_never_followed() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})

    fetcher = fetcher_with(handler)

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)

    assert len(calls) == 1


@pytest.mark.parametrize("status", [404, 500, 204])
async def test_anything_but_a_200_is_an_error(status: int) -> None:
    fetcher = fetcher_with(lambda request: httpx.Response(status))

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)


async def test_an_oversized_document_is_cut_off() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b" " * (MAX_DOCUMENT_BYTES + 1))

    fetcher = fetcher_with(handler)

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)


@pytest.mark.parametrize("body", [b"not json", b"[1, 2, 3]", b'"text"', b""])
async def test_non_object_json_is_an_error(body: bytes) -> None:
    fetcher = fetcher_with(lambda request: httpx.Response(200, content=body))

    with pytest.raises(CimdError):
        await fetcher.fetch(URL)


async def test_a_document_just_under_the_limit_is_accepted() -> None:
    padding = "x" * (MAX_DOCUMENT_BYTES - 200)
    body = json.dumps({**good_document(), "padding": padding}).encode()
    assert len(body) < MAX_DOCUMENT_BYTES

    document = await fetcher_with(lambda request: httpx.Response(200, content=body)).fetch(URL)

    assert document["client_id"] == URL


async def test_an_invalid_url_is_rejected_before_any_lookup() -> None:
    looked_up: list[str] = []

    async def spy(host: str, port: int) -> list[str]:
        looked_up.append(host)
        return [PUBLIC_V4]

    fetcher = HttpDocumentFetcher(resolver=spy)

    with pytest.raises(CimdError):
        await fetcher.fetch("http://client.example/metadata.json")

    assert looked_up == []


async def test_the_fetch_asks_for_an_uncompressed_answer() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return json_response(good_document())

    await fetcher_with(handler).fetch(URL)

    assert seen[0].headers["accept-encoding"] == "identity"


@pytest.mark.parametrize(
    ("encoding", "compress"), [("gzip", gzip.compress), ("deflate", zlib.compress)]
)
async def test_a_compressed_answer_is_refused_so_it_cannot_expand_in_memory(
    encoding: str, compress: Callable[[bytes], bytes]
) -> None:
    body = compress(b"{}")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=body,
            headers={"content-type": "application/json", "content-encoding": encoding},
        )

    with pytest.raises(CimdError, match="must not be compressed"):
        await fetcher_with(handler).fetch(URL)


async def test_an_explicitly_uncompressed_answer_is_fine() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=good_document(), headers={"content-encoding": "identity"})

    assert (await fetcher_with(handler).fetch(URL))["client_name"] == "Grok"


async def test_a_fetch_that_drags_on_is_cut_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cimd_module, "FETCH_DEADLINE_SECONDS", 0.05)

    async def slow_resolver(host: str, port: int) -> list[str]:
        await asyncio.sleep(1)
        return [PUBLIC_V4]

    fetcher = HttpDocumentFetcher(resolver=slow_resolver)

    with pytest.raises(CimdError, match="took too long"):
        await fetcher.fetch(URL)


async def test_only_a_few_fetches_run_at_the_same_time(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cimd_module, "MAX_CONCURRENT_FETCHES", 2)
    running = 0
    busiest = 0

    async def counting_resolver(host: str, port: int) -> list[str]:
        nonlocal running, busiest
        running += 1
        busiest = max(busiest, running)
        await asyncio.sleep(0.02)
        running -= 1
        return [PUBLIC_V4]

    transport = httpx.MockTransport(lambda request: json_response(good_document()))
    fetcher = HttpDocumentFetcher(
        resolver=counting_resolver,
        client_factory=lambda: httpx.AsyncClient(transport=transport),
    )

    documents = await asyncio.gather(*(fetcher.fetch(URL) for _ in range(6)))

    assert len(documents) == 6
    assert busiest == 2
