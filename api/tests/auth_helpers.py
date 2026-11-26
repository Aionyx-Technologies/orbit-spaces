from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from httpx import Response


def open_sign_in_link(client: TestClient, link: str) -> Response:
    query = parse_qs(urlparse(link).query)
    return client.post(
        "/auth/verify",
        data={"token": query["token"][0], "next": query.get("next", [""])[0]},
    )
