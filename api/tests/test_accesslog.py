from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient
from starlette.types import Scope

from orbit.accesslog import UNMATCHED, route_label
from tests.oauth_helpers import register


def access_lines(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [record.getMessage() for record in caplog.records if record.name == "orbit.access"]


def test_requests_are_logged_by_route_template_without_the_query_string(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="orbit.access"):
        client.get("/auth/verify?token=super-secret-token&next=%2Fspaces")

    [line] = access_lines(caplog)
    assert line.startswith("GET /auth/verify 400 ")
    assert "super-secret-token" not in line
    assert "?" not in line


def test_routes_under_the_api_prefix_keep_it_but_never_log_ids(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="orbit.access"):
        client.get("/api/me")
        client.get("/api/spaces/space-secret-id-123/items?before=another-secret")

    lines = access_lines(caplog)
    assert lines[0].startswith("GET /api/me 401 ")
    assert lines[1].startswith("GET /api/spaces/{space_id}/items 401 ")
    assert not any("secret" in line for line in lines)


def test_fixed_oauth_and_mcp_paths_are_named(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="orbit.access"):
        register(client)
        client.get("/.well-known/oauth-authorization-server")
        client.post("/mcp", json={})

    lines = access_lines(caplog)
    assert any(line.startswith("POST /oauth/register 201 ") for line in lines)
    assert any(
        line.startswith("GET /.well-known/oauth-authorization-server 200 ") for line in lines
    )
    assert any(line.startswith("POST /mcp ") for line in lines)


def test_unknown_paths_are_never_echoed_into_the_log(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="orbit.access"):
        client.get("/definitely/not/a/route/with-a-secret-looking-value-123")

    [line] = access_lines(caplog)
    assert UNMATCHED in line
    assert "secret-looking" not in line


@pytest.mark.parametrize(
    ("scope", "expected"),
    [
        ({"path": "/oauth/token"}, "/oauth/token"),
        ({"path": "/oauth/token/extra"}, UNMATCHED),
        ({"path": "/invite/abc123"}, UNMATCHED),
        ({}, UNMATCHED),
    ],
)
def test_route_labels(scope: Scope, expected: str) -> None:
    assert route_label(scope) == expected
