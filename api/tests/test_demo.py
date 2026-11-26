from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from orbit.config import Settings, SettingsError
from orbit.db import session_scope
from orbit.main import Overrides, create_app
from orbit.models import Invite, Item, Memory, Space
from orbit.runtime import Runtime
from tests.conftest import SECRET_KEY, FakeClock, RecordingSender

LOCAL = "http://localhost:3000"


def demo_settings(tmp_path: Path, **overrides: Any) -> Settings:
    return Settings(
        _env_file=None,
        base_url=overrides.pop("base_url", LOCAL),
        secret_key=SECRET_KEY,
        database_url=f"sqlite:///{tmp_path / 'demo.db'}",
        demo_mode=overrides.pop("demo_mode", True),
        **overrides,
    )


@pytest.fixture
def demo_client(tmp_path: Path, clock: FakeClock, sender: RecordingSender) -> Iterator[TestClient]:
    app = create_app(demo_settings(tmp_path), overrides=Overrides(clock=clock, sender=sender))
    with TestClient(
        app, base_url=LOCAL, follow_redirects=False, headers={"Origin": LOCAL}
    ) as client:
        yield client


@pytest.fixture
def demo_runtime(demo_client: TestClient) -> Runtime:
    runtime: Runtime = demo_client.app.state.runtime  # type: ignore[attr-defined]
    return runtime


def test_demo_mode_is_off_unless_it_is_switched_on(tmp_path: Path) -> None:
    settings = Settings(_env_file=None, secret_key=SECRET_KEY, base_url=LOCAL)

    assert settings.demo_mode is False


def test_demo_mode_can_be_switched_on_with_its_environment_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ORBIT_DEMO_MODE", "true")

    settings = Settings(_env_file=None, secret_key=SECRET_KEY, base_url=LOCAL)

    assert settings.demo_mode is True


def test_an_empty_demo_setting_means_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORBIT_DEMO_MODE", "")

    assert Settings(_env_file=None, secret_key=SECRET_KEY, base_url=LOCAL).demo_mode is False


@pytest.mark.parametrize(
    "base_url", ["https://orbit.example.com", "https://localhost.evil.example"]
)
def test_demo_mode_refuses_to_start_on_a_public_address(tmp_path: Path, base_url: str) -> None:
    with pytest.raises((ValidationError, SettingsError)):
        demo_settings(tmp_path, base_url=base_url)


@pytest.mark.parametrize("base_url", ["http://localhost", "http://127.0.0.1:3000"])
def test_demo_mode_is_allowed_on_local_addresses(tmp_path: Path, base_url: str) -> None:
    assert demo_settings(tmp_path, base_url=base_url).demo_mode is True


def test_the_demo_route_does_not_exist_when_demo_mode_is_off(client: TestClient) -> None:
    response = client.post("/auth/demo", data={"person": "alex"})

    assert response.status_code == 404
    assert "orbit_session" not in response.cookies


def test_the_demo_info_says_it_is_off_when_it_is_off(client: TestClient) -> None:
    assert client.get("/api/demo").json() == {"enabled": False, "people": []}


def test_the_demo_info_lists_the_people_when_it_is_on(demo_client: TestClient) -> None:
    assert demo_client.get("/api/demo").json() == {
        "enabled": True,
        "people": [{"key": "alex", "name": "Alex"}, {"key": "blake", "name": "Blake"}],
    }


def test_alex_goes_straight_to_the_logged_in_page(demo_client: TestClient) -> None:
    response = demo_client.post("/auth/demo", data={"person": "alex"})

    assert response.status_code == 303
    assert response.headers["location"] == "/spaces"
    cookie = response.headers["set-cookie"].lower()
    assert "orbit_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    me = demo_client.get("/api/me").json()
    assert (me["email"], me["display_name"]) == ("alex@example.com", "Alex")
    names = [space["name"] for space in demo_client.get("/api/spaces").json()["spaces"]]
    assert sorted(names) == ["Cabin weekend", "Goa trip", "Weekend in Lisbon"]


def test_blake_goes_straight_to_the_logged_in_page_and_shares_the_goa_trip(
    demo_client: TestClient,
) -> None:
    response = demo_client.post("/auth/demo", data={"person": "blake"})

    assert response.status_code == 303
    me = demo_client.get("/api/me").json()
    assert (me["email"], me["display_name"]) == ("blake@example.com", "Blake")
    names = [space["name"] for space in demo_client.get("/api/spaces").json()["spaces"]]
    assert sorted(names) == ["Book club", "Cabin weekend", "Goa trip"]


def test_the_sample_space_has_notes_facts_and_a_plan_written_by_orbit(
    demo_client: TestClient,
) -> None:
    demo_client.post("/auth/demo", data={"person": "alex"})
    spaces = demo_client.get("/api/spaces").json()["spaces"]
    goa = next(space for space in spaces if space["name"] == "Goa trip")

    detail = demo_client.get(f"/api/spaces/{goa['id']}").json()
    feed = demo_client.get(f"/api/spaces/{goa['id']}/items").json()["items"]

    assert [member["display_name"] for member in detail["members"]] == ["Alex", "Blake"]
    assert sorted(fact["key"] for fact in detail["memory"]) == ["Budget", "Dates", "Hotel"]
    assert detail["latest_plan"]["author_kind"] == "orbit"
    assert sorted(item["title"] for item in feed) == [
        "Combined plan",
        "Hotel shortlist",
        "Morning flight",
        "Packing list",
    ]
    assert {item["via"] for item in feed} == {"ChatGPT", "Grok", "web", "orbit"}


def test_the_sample_data_is_created_once_however_often_people_sign_in(
    demo_client: TestClient, demo_runtime: Runtime
) -> None:
    for person in ("alex", "blake", "alex", "blake"):
        demo_client.cookies.clear()
        assert demo_client.post("/auth/demo", data={"person": person}).status_code == 303

    with session_scope(demo_runtime.session_factory) as db:
        assert db.scalar(select(func.count()).select_from(Space)) == 4
        assert db.scalar(select(func.count()).select_from(Memory)) == 5
        assert db.scalar(select(func.count()).select_from(Item)) == 7
        assert db.scalar(select(func.count()).select_from(Invite)) == 2


def test_an_unknown_person_is_refused_and_gets_no_session(demo_client: TestClient) -> None:
    response = demo_client.post("/auth/demo", data={"person": "mallory"})

    assert response.status_code == 404
    assert "set-cookie" not in response.headers
    assert demo_client.get("/api/me").status_code == 401


def test_a_page_on_another_site_cannot_log_anyone_in(demo_client: TestClient) -> None:
    response = demo_client.post(
        "/auth/demo", data={"person": "alex"}, headers={"Origin": "https://evil.example"}
    )

    assert response.status_code == 403
    assert "set-cookie" not in response.headers
    assert demo_client.get("/api/me").status_code == 401


def test_the_person_goes_on_to_where_they_were_headed(demo_client: TestClient) -> None:
    response = demo_client.post(
        "/auth/demo", data={"person": "alex", "next": "/oauth/consent?request=abc"}
    )

    assert response.headers["location"] == "/oauth/consent?request=abc"


@pytest.mark.parametrize("hostile", ["https://evil.example", "//evil.example", "/\\evil.example"])
def test_the_destination_cannot_leave_the_site(demo_client: TestClient, hostile: str) -> None:
    response = demo_client.post("/auth/demo", data={"person": "alex", "next": hostile})

    assert response.headers["location"] == "/spaces"


def test_the_sign_in_page_offers_both_people_when_demo_mode_is_on(
    demo_client: TestClient,
) -> None:
    page = demo_client.get("/auth/sign-in?next=/spaces/abc")

    assert "Demo mode is on" in page.text
    assert 'action="/auth/demo"' in page.text
    assert 'value="alex"' in page.text
    assert 'value="blake"' in page.text
    assert "Continue as Alex" in page.text
    assert "Continue as Blake" in page.text
    assert 'name="next" value="/spaces/abc"' in page.text


def test_the_sign_in_page_does_not_mention_the_demo_otherwise(client: TestClient) -> None:
    page = client.get("/auth/sign-in")

    assert "Demo mode" not in page.text
    assert "/auth/demo" not in page.text


def test_switching_demo_mode_on_logs_a_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        create_app(demo_settings(tmp_path), run_db_migrations=False)

    assert "ORBIT_DEMO_MODE is on" in caplog.text


def test_leaving_it_off_logs_nothing_about_it(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="orbit.main"):
        create_app(demo_settings(tmp_path, demo_mode=False), run_db_migrations=False)

    assert "ORBIT_DEMO_MODE" not in caplog.text


def sign_in_as(demo_client: TestClient, person: str) -> None:
    demo_client.cookies.clear()
    assert demo_client.post("/auth/demo", data={"person": person}).status_code == 303


def invitations_for(demo_client: TestClient, person: str) -> list[dict[str, Any]]:
    sign_in_as(demo_client, person)
    response = demo_client.get("/api/invitations")
    assert response.status_code == 200
    invitations: list[dict[str, Any]] = response.json()["invitations"]
    return invitations


def cards_for(demo_client: TestClient, person: str) -> dict[str, dict[str, Any]]:
    sign_in_as(demo_client, person)
    spaces = demo_client.get("/api/spaces").json()["spaces"]
    return {space["name"]: space for space in spaces}


def test_each_demo_person_starts_with_one_pending_invitation_from_the_other(
    demo_client: TestClient,
) -> None:
    alex = invitations_for(demo_client, "alex")
    blake = invitations_for(demo_client, "blake")

    assert [(row["space_name"], row["invited_by"]) for row in alex] == [("Book club", "Blake")]
    assert [(row["space_name"], row["invited_by"]) for row in blake] == [
        ("Weekend in Lisbon", "Alex")
    ]


def test_the_demo_spaces_make_rich_cards(demo_client: TestClient) -> None:
    cards = cards_for(demo_client, "alex")
    goa, cabin, lisbon = cards["Goa trip"], cards["Cabin weekend"], cards["Weekend in Lisbon"]

    assert (goa["note_count"], goa["fact_count"], goa["has_plan"]) == (3, 3, True)
    assert goa["sources"] == ["Grok", "ChatGPT"]
    assert [highlight["key"] for highlight in goa["highlights"]] == ["Dates", "Budget", "Hotel"]
    assert (goa["latest"]["title"], goa["latest"]["kind"]) == ("Combined plan", "plan")
    assert cabin["owner_name"] == "Blake"
    assert (cabin["note_count"], cabin["fact_count"], cabin["has_plan"]) == (2, 2, False)
    assert cabin["highlights"] == [
        {"key": "Dates", "value": "Jan 10 to 12"},
        {"key": "Headcount", "value": "6 people"},
    ]
    assert cabin["sources"] == ["Claude"]
    assert {key: value for key, value in cabin["latest"].items() if key != "created_at"} == {
        "title": "Grocery run",
        "kind": "note",
        "via": "web",
        "author_kind": "person",
        "shared_by_name": "Alex",
    }
    assert lisbon["last_activity_at"] == lisbon["created_at"]
    assert (lisbon["note_count"], lisbon["fact_count"], lisbon["latest"]) == (0, 0, None)


def test_accepting_a_demo_invitation_joins_the_space_and_it_does_not_come_back(
    demo_client: TestClient,
) -> None:
    [invitation] = invitations_for(demo_client, "alex")

    accepted = demo_client.post(f"/api/invitations/{invitation['id']}/accept")

    assert accepted.status_code == 200
    assert accepted.json()["already_member"] is False
    names = [space["name"] for space in demo_client.get("/api/spaces").json()["spaces"]]
    assert "Book club" in names
    assert demo_client.get("/api/invitations").json()["invitations"] == []
    assert invitations_for(demo_client, "alex") == []


def test_declining_a_demo_invitation_hides_it_until_the_next_demo_sign_in(
    demo_client: TestClient,
) -> None:
    [invitation] = invitations_for(demo_client, "alex")

    declined = demo_client.post(f"/api/invitations/{invitation['id']}/decline")

    assert declined.status_code == 204
    assert demo_client.get("/api/invitations").json()["invitations"] == []
    [restored] = invitations_for(demo_client, "alex")
    assert restored["space_name"] == "Book club"
    assert restored["id"] != invitation["id"]
