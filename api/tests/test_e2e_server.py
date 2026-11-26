from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.auth_helpers import open_sign_in_link
from tests.conftest import BASE_URL, SECRET_KEY
from tests.e2e_server import build_e2e_app


@pytest.fixture
def e2e_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ORBIT_BASE_URL", BASE_URL)
    monkeypatch.setenv("ORBIT_SECRET_KEY", SECRET_KEY)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'e2e.db'}")
    return TestClient(
        build_e2e_app(), base_url=BASE_URL, follow_redirects=False, headers={"Origin": BASE_URL}
    )


def test_emails_are_readable_straight_after_a_sign_in_request(e2e_client: TestClient) -> None:
    with e2e_client as client:
        client.post("/auth/sign-in", data={"email": "alex@example.com", "next": "/spaces"})
        everything = client.get("/__test__/emails").json()["messages"]
        filtered = client.get("/__test__/emails", params={"to": "alex@example.com"}).json()
        nobody = client.get("/__test__/emails", params={"to": "nobody@example.com"}).json()

    assert [m["to"] for m in everything] == ["alex@example.com"]
    assert "/auth/verify?token=" in filtered["messages"][0]["text"]
    assert filtered["messages"][0]["subject"] == "Your Orbit sign-in link"
    assert nobody == {"messages": []}


def test_the_harness_offers_a_scripted_combiner_so_the_combine_button_shows(
    e2e_client: TestClient,
) -> None:
    with e2e_client as client:
        client.post("/auth/sign-in", data={"email": "alex@example.com"})
        words = client.get("/__test__/emails").json()["messages"][0]["text"].split()
        verified = open_sign_in_link(
            client, next(part for part in words if part.startswith("http"))
        )
        me = client.get("/api/me")

    assert verified.status_code == 303
    assert me.json()["combine_enabled"] is True
