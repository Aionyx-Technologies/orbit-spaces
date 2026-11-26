from __future__ import annotations

import io
import os
import re
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from orbit.auth.sessions import OTHER_BROWSER, browser_name
from orbit.db import session_scope
from orbit.events import PROFILE_CHANGED, SpaceEvent
from orbit.images import NOT_A_PICTURE, UNREADABLE
from orbit.limits import AVATAR_BODY_MAX_BYTES, AVATAR_UPLOAD_MAX_BYTES
from orbit.models import OAuthClient, OAuthToken, WebSession
from orbit.runtime import Runtime
from tests.conftest import FakeClock, RecordingSender
from tests.image_helpers import encode, picture
from tests.rest_helpers import HOST, People, create_space, join, share

ALEX = "alex@example.com"
BLAKE = "blake@example.com"
CAROL = "carol@example.com"
CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)
FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
SESSION = "orbit_session"


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def upload(client: TestClient, data: bytes, content_type: str = "image/jpeg") -> Any:
    return client.post("/api/me/avatar", files={"file": ("photo", data, content_type)})


def me(client: TestClient) -> dict[str, Any]:
    body: dict[str, Any] = client.get("/api/me").json()
    return body


def test_a_new_account_has_the_default_profile_and_preferences(people: People) -> None:
    body = me(people.as_(ALEX))

    assert body["about"] == ""
    assert body["avatar_url"] is None
    assert body["time_zone"] == "UTC"
    assert body["email_frequency"] == "instant"
    assert body["default_space_id"] is None


def test_the_old_name_only_update_still_works(people: People) -> None:
    client = people.as_(ALEX)

    response = client.patch("/api/me", json={"display_name": "  Alex   Smith "})

    assert response.status_code == 200
    assert response.json()["display_name"] == "Alex Smith"
    assert response.json()["email_frequency"] == "instant"


def test_every_setting_can_be_changed_and_is_remembered(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client, "Goa trip")

    response = client.patch(
        "/api/me",
        json={
            "about": "Plans the trips",
            "time_zone": "Asia/Kolkata",
            "email_frequency": "daily",
            "default_space_id": space["id"],
        },
    )

    assert response.status_code == 200
    saved = me(client)
    assert saved["about"] == "Plans the trips"
    assert saved["time_zone"] == "Asia/Kolkata"
    assert saved["email_frequency"] == "daily"
    assert saved["default_space_id"] == space["id"]


def test_an_update_with_nothing_in_it_changes_nothing(people: People) -> None:
    client = people.as_(ALEX)
    client.patch("/api/me", json={"about": "Keep me"})

    response = client.patch("/api/me", json={})

    assert response.status_code == 200
    assert response.json()["about"] == "Keep me"


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        ({"display_name": "   "}, "Name cannot be empty."),
        ({"about": "x" * 161}, "About me is too long. The limit is 160 characters."),
        ({"time_zone": "Mars/Olympus"}, "That time zone is not one Orbit knows."),
        ({"email_frequency": "weekly"}, "Choose as it happens, a daily summary, or off."),
    ],
)
def test_a_bad_value_is_refused_with_a_plain_message_and_changes_nothing(
    people: People, body: dict[str, str], fragment: str
) -> None:
    client = people.as_(ALEX)
    before = me(client)

    response = client.patch("/api/me", json={"about": "Changed", **body})

    assert response.status_code == 422
    assert fragment in response.json()["error"]["message"]
    assert me(client) == before


def test_a_default_space_the_person_is_not_in_is_refused(people: People) -> None:
    theirs = create_space(people.as_(BLAKE), "Blake only")

    response = people.as_(ALEX).patch("/api/me", json={"default_space_id": theirs["id"]})

    assert response.status_code == 403
    assert me(people.as_(ALEX))["default_space_id"] is None


def test_the_default_space_can_be_cleared_with_null(people: People) -> None:
    client = people.as_(ALEX)
    space = create_space(client, "Goa trip")
    client.patch("/api/me", json={"default_space_id": space["id"]})

    client.patch("/api/me", json={"default_space_id": None})

    assert me(client)["default_space_id"] is None


def test_about_me_comes_back_as_text_exactly_as_typed(people: People) -> None:
    client = people.as_(ALEX)

    client.patch("/api/me", json={"about": '<script>alert(1)</script> & "quotes"'})

    assert me(client)["about"] == '<script>alert(1)</script> & "quotes"'


def test_a_photo_can_be_uploaded_and_is_served_as_a_square_webp(people: People) -> None:
    client = people.as_(ALEX)

    response = upload(client, picture(size=(640, 480)))

    assert response.status_code == 200
    url = response.json()["avatar_url"]
    assert url.startswith(f"/api/users/{response.json()['id']}/avatar?v=")
    photo = client.get(url)
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/webp"
    assert photo.headers["x-content-type-options"] == "nosniff"
    assert photo.headers["cache-control"].startswith("private, max-age=")
    assert "immutable" in photo.headers["cache-control"]
    stored = Image.open(io.BytesIO(photo.content))
    assert (stored.format, stored.size) == ("WEBP", (256, 256))


def test_the_file_is_judged_by_its_contents_not_by_what_the_upload_says_it_is(
    people: People,
) -> None:
    client = people.as_(ALEX)

    mislabelled_real = upload(client, picture(), "text/plain")
    mislabelled_fake = upload(client, b"just some text", "image/png")

    assert mislabelled_real.status_code == 200
    assert mislabelled_fake.status_code == 422
    assert mislabelled_fake.json()["error"]["message"] == UNREADABLE


def test_a_picture_in_the_wrong_format_is_refused_clearly(people: People) -> None:
    response = upload(people.as_(ALEX), encode(Image.new("RGB", (64, 64)), "GIF"), "image/gif")

    assert response.status_code == 422
    assert response.json()["error"]["message"] == NOT_A_PICTURE


def test_a_refused_upload_keeps_the_photo_the_person_had(people: People) -> None:
    client = people.as_(ALEX)
    first = upload(client, picture((200, 40, 40)))
    kept = client.get(first.json()["avatar_url"]).content

    upload(client, b"not a picture")

    assert client.get(me(client)["avatar_url"]).content == kept


def test_a_photo_bigger_than_the_global_request_limit_still_gets_through(people: People) -> None:
    noise = Image.frombytes("RGB", (300, 300), os.urandom(300 * 300 * 3))
    large = encode(noise, "PNG")
    assert len(large) > 256 * 1024

    response = upload(people.as_(ALEX), large, "image/png")

    assert response.status_code == 200


def test_a_file_just_over_five_megabytes_is_refused_with_a_clear_message(
    people: People,
) -> None:
    body = b"x" * (AVATAR_UPLOAD_MAX_BYTES + 10_000)

    response = upload(people.as_(ALEX), body)

    assert response.status_code == 422
    assert "larger than 5 MB" in response.json()["error"]["message"]


def test_a_request_far_over_the_upload_limit_is_stopped_before_it_is_read(
    people: People,
) -> None:
    body = b"x" * (AVATAR_BODY_MAX_BYTES + 10_000)

    response = upload(people.as_(ALEX), body)

    assert response.status_code == 413


def test_other_routes_keep_the_small_request_limit(people: People) -> None:
    response = people.as_(ALEX).post(
        "/api/spaces", content=b"x" * 300_000, headers={"content-type": "application/json"}
    )

    assert response.status_code == 413


def test_uploading_needs_a_session_and_the_sites_own_origin(people: People) -> None:
    anonymous = upload(people.anonymous(), picture())
    foreign = people.as_(ALEX).post(
        "/api/me/avatar",
        files={"file": ("photo", picture(), "image/jpeg")},
        headers={"Origin": "https://evil.example"},
    )

    assert anonymous.status_code == 401
    assert foreign.status_code == 403


def test_a_photo_can_be_removed(people: People) -> None:
    client = people.as_(ALEX)
    url = upload(client, picture()).json()["avatar_url"]

    response = client.delete("/api/me/avatar")

    assert response.status_code == 200
    assert response.json()["avatar_url"] is None
    assert client.get(url).status_code == 404


def test_the_person_and_people_in_a_shared_space_can_load_a_photo_and_nobody_else(
    people: People,
) -> None:
    owner = people.as_(ALEX)
    space = create_space(owner, "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    url = upload(people.as_(ALEX), picture()).json()["avatar_url"]

    own = people.as_(ALEX).get(url)
    shared = people.as_(BLAKE).get(url)
    stranger = people.as_(CAROL).get(url)
    anonymous = people.anonymous().get(url)

    assert (own.status_code, shared.status_code) == (200, 200)
    assert own.content == shared.content
    assert stranger.status_code == 404
    assert anonymous.status_code == 401


def test_asking_for_someone_with_no_photo_or_no_such_person_is_a_plain_not_found(
    people: People,
) -> None:
    client = people.as_(ALEX)
    own_id = me(client)["id"]

    no_photo = client.get(f"/api/users/{own_id}/avatar")
    nobody = client.get("/api/users/00000000-0000-0000-0000-000000000000/avatar")

    assert no_photo.status_code == 404
    assert nobody.status_code == 404
    assert no_photo.json() == nobody.json()


def test_members_notes_and_facts_carry_the_photo_and_the_about_line(people: People) -> None:
    owner = people.as_(ALEX)
    space = create_space(owner, "Goa trip")
    join(people, ALEX, BLAKE, space["id"])
    people.as_(BLAKE).patch("/api/me", json={"about": "Books the hotels"})
    blake_url = upload(people.as_(BLAKE), picture((200, 40, 40))).json()["avatar_url"]
    share(people.as_(BLAKE), space["id"], "Hotels", "Three options")
    people.as_(BLAKE).put(
        f"/api/spaces/{space['id']}/memory", json={"key": "Budget", "value": "$3,000"}
    )

    detail = people.as_(ALEX).get(f"/api/spaces/{space['id']}").json()
    feed = people.as_(ALEX).get(f"/api/spaces/{space['id']}/items").json()

    members = {member["display_name"]: member for member in detail["members"]}
    assert members["Blake"]["avatar_url"] == blake_url
    assert members["Blake"]["about"] == "Books the hotels"
    assert members["Alex"]["avatar_url"] is None
    assert members["Alex"]["about"] == ""
    assert detail["memory"][0]["set_by"]["avatar_url"] == blake_url
    assert feed["items"][0]["shared_by"]["avatar_url"] == blake_url


def test_a_changed_photo_changes_its_address_so_old_copies_are_not_reused(
    people: People, clock: FakeClock
) -> None:
    client = people.as_(ALEX)
    first = upload(client, picture()).json()["avatar_url"]
    clock.advance(seconds=30)

    second = upload(client, picture((10, 200, 10))).json()["avatar_url"]

    assert first != second


def test_the_invite_page_shows_who_invited_you_with_their_photo(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    upload(people.as_(ALEX), picture())
    token = (
        people.as_(ALEX)
        .post(f"/api/spaces/{space['id']}/invites", json={})
        .json()["url"]
        .rsplit("/", 1)[-1]
    )

    view = people.anonymous().get(f"/api/invites/{token}").json()
    photo = people.anonymous().get(f"/api/invites/{token}/inviter-avatar")

    assert view["invited_by"] == "Alex"
    assert view["inviter_avatar_url"].startswith(f"/api/invites/{token}/inviter-avatar?v=")
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/webp"


def test_an_inviter_without_a_photo_shows_none(people: People) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    token = (
        people.as_(ALEX)
        .post(f"/api/spaces/{space['id']}/invites", json={})
        .json()["url"]
        .rsplit("/", 1)[-1]
    )

    view = people.anonymous().get(f"/api/invites/{token}").json()

    assert view["inviter_avatar_url"] is None
    assert people.anonymous().get(f"/api/invites/{token}/inviter-avatar").status_code == 404


def test_the_inviters_photo_stops_loading_once_the_invite_is_used_or_unknown(
    people: People,
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    upload(people.as_(ALEX), picture())
    token = (
        people.as_(ALEX)
        .post(f"/api/spaces/{space['id']}/invites", json={})
        .json()["url"]
        .rsplit("/", 1)[-1]
    )
    people.as_(BLAKE).post(f"/api/invites/{token}/accept")

    used = people.anonymous().get(f"/api/invites/{token}/inviter-avatar")
    unknown = people.anonymous().get("/api/invites/not-a-real-token/inviter-avatar")

    assert used.status_code == 404
    assert unknown.status_code == 404


def test_an_emailed_invite_carries_the_inviters_photo(people: People, runtime: Runtime) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")
    upload(people.as_(ALEX), picture())

    created = people.as_(ALEX).post(
        f"/api/spaces/{space['id']}/invites", json={"email": "dana@example.com"}
    )
    runtime.env.mailer.drain()

    token = created.json()["url"].rsplit("/", 1)[-1]
    [sent] = people.sender.to("dana@example.com")
    assert f"https://orbit.test/api/invites/{token}/inviter-avatar?v=" in (sent.html or "")
    assert "inviter-avatar" not in sent.text


def test_an_emailed_invite_from_someone_without_a_photo_has_no_picture(
    people: People, runtime: Runtime
) -> None:
    space = create_space(people.as_(ALEX), "Goa trip")

    people.as_(ALEX).post(f"/api/spaces/{space['id']}/invites", json={"email": "dana@example.com"})
    runtime.env.mailer.drain()

    [sent] = people.sender.to("dana@example.com")
    images = re.findall(r'<img src="([^"]+)"', sent.html or "")
    assert [src for src in images if not src.endswith("/apple-icon.png")] == []


@pytest.mark.parametrize(
    ("agent", "expected"),
    [
        (CHROME, "Chrome"),
        (CHROME + " Edg/130.0.0.0", "Edge"),
        (CHROME + " OPR/115.0.0.0", "Opera"),
        (FIREFOX, "Firefox"),
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Safari",
        ),
        (
            "Mozilla/5.0 (iPhone) AppleWebKit/605 (KHTML) CriOS/130.0 Mobile/15E148 Safari/604",
            "Chrome",
        ),
        ("Mozilla/5.0 (iPhone) AppleWebKit/605 (KHTML) EdgiOS/130.0 Mobile Safari/605", "Edge"),
        ("curl/8.4.0", OTHER_BROWSER),
        ("", ""),
        (None, ""),
    ],
)
def test_only_the_browser_name_is_kept_from_the_user_agent(
    agent: str | None, expected: str
) -> None:
    assert browser_name(agent) == expected


def test_a_session_remembers_the_browser_name_and_never_the_full_user_agent(
    people: People, runtime: Runtime
) -> None:
    people.client.headers["user-agent"] = CHROME
    people.sign_in(ALEX)

    with session_scope(runtime.session_factory) as db:
        stored = db.scalars(select(WebSession.user_agent)).all()

    assert stored == ["Chrome"]
    assert all("Mozilla" not in value and len(value) <= 40 for value in stored)


def test_the_last_sign_in_line_shows_the_previous_visit_by_date_and_browser(
    people: People,
) -> None:
    people.client.headers["user-agent"] = CHROME
    people.sign_in(ALEX)
    first = people.client.cookies[SESSION]
    people.client.headers["user-agent"] = FIREFOX
    people.sign_in(ALEX)
    second = people.client.cookies[SESSION]

    people.client.cookies.set(SESSION, second, domain=HOST, path="/")
    from_second = me(people.client)["last_sign_in"]
    people.client.cookies.set(SESSION, first, domain=HOST, path="/")
    from_first = me(people.client)["last_sign_in"]

    assert from_second["browser"] == "Chrome"
    assert from_first["browser"] == "Firefox"
    assert set(from_second) == {"at", "browser"}


def test_with_only_one_sign_in_the_line_describes_this_one(people: People) -> None:
    people.client.headers["user-agent"] = FIREFOX

    people.sign_in(ALEX)

    assert me(people.client)["last_sign_in"]["browser"] == "Firefox"


def revoke_probe(runtime: Runtime, user_id: str) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        db.add(
            OAuthClient(
                client_id="https://assistant.example/client.json",
                client_name="TestAssistant",
                redirect_uris=["https://assistant.example/callback"],
                registration_type="cimd",
                metadata_json={},
                created_at=now,
            )
        )
        db.flush()
        db.add(
            OAuthToken(
                access_hash="a" * 64,
                refresh_hash="r" * 64,
                client_id="https://assistant.example/client.json",
                user_id=user_id,
                scopes=["spaces"],
                resource=None,
                access_expires_at=now + timedelta(hours=1),
                refresh_expires_at=now + timedelta(days=30),
                revoked_at=None,
                created_at=now,
            )
        )
        db.commit()


def test_signing_out_everywhere_ends_every_session_and_leaves_assistants_connected(
    people: People, runtime: Runtime
) -> None:
    people.sign_in(ALEX)
    first = people.client.cookies[SESSION]
    people.sign_in(ALEX)
    second = people.client.cookies[SESSION]
    revoke_probe(runtime, me(people.client)["id"])

    response = people.client.post("/api/me/sessions/revoke-all")

    assert response.status_code == 204
    assert SESSION in response.headers["set-cookie"]
    for token in (first, second):
        people.client.cookies.clear()
        people.client.cookies.set(SESSION, token, domain=HOST, path="/")
        assert people.client.get("/api/me").status_code == 401
    with session_scope(runtime.session_factory) as db:
        tokens = db.scalars(select(OAuthToken)).all()
        assert [row.revoked_at for row in tokens] == [None]
        assert db.scalars(select(WebSession)).all() == []


def test_signing_out_everywhere_does_not_touch_other_peoples_sessions(
    people: People,
) -> None:
    people.sign_in(ALEX)
    people.sign_in(BLAKE)

    people.as_(ALEX).post("/api/me/sessions/revoke-all")

    assert people.as_(BLAKE).get("/api/me").status_code == 200


def test_signing_out_everywhere_needs_a_session_and_the_sites_own_origin(
    people: People,
) -> None:
    anonymous = people.anonymous().post("/api/me/sessions/revoke-all")
    foreign = people.as_(ALEX).post(
        "/api/me/sessions/revoke-all", headers={"Origin": "https://evil.example"}
    )

    assert anonymous.status_code == 401
    assert foreign.status_code == 403
    assert people.as_(ALEX).get("/api/me").status_code == 200


def test_a_person_can_change_their_photo_ten_times_a_day_and_no_more(
    people: People, clock: FakeClock
) -> None:
    client = people.as_(ALEX)

    allowed = [upload(client, picture()).status_code for _ in range(10)]
    refused = upload(client, picture())

    assert allowed == [200] * 10
    assert refused.status_code == 429
    assert refused.json()["error"]["message"] == (
        "You have changed your photo as often as allowed today. Try again tomorrow."
    )
    assert upload(people.as_(BLAKE), picture()).status_code == 200
    clock.advance(days=1, seconds=5)
    assert upload(people.as_(ALEX), picture()).status_code == 200


def test_a_refused_photo_does_not_replace_the_one_the_person_had_after_the_limit(
    people: People,
) -> None:
    client = people.as_(ALEX)
    for _ in range(10):
        upload(client, picture((10, 10, 10)))
    kept = client.get(me(client)["avatar_url"]).content

    upload(client, picture((250, 250, 250)))

    assert client.get(me(client)["avatar_url"]).content == kept


def watch_events(runtime: Runtime, monkeypatch: pytest.MonkeyPatch) -> list[SpaceEvent]:
    published: list[SpaceEvent] = []
    monkeypatch.setattr(runtime.env.events, "publish", published.append)
    return published


@pytest.mark.parametrize("change", [{"display_name": "Alex Smith"}, {"about": "Plans the trips"}])
def test_a_new_name_or_about_line_is_announced_to_every_space_the_person_is_in(
    people: People,
    runtime: Runtime,
    monkeypatch: pytest.MonkeyPatch,
    change: dict[str, str],
) -> None:
    client = people.as_(ALEX)
    goa = create_space(client, "Goa trip")
    work = create_space(client, "Work")
    own_id = me(client)["id"]
    published = watch_events(runtime, monkeypatch)

    client.patch("/api/me", json=change)

    assert sorted(published, key=lambda event: event.space_id) == sorted(
        [
            SpaceEvent(PROFILE_CHANGED, goa["id"], {"user_id": own_id}),
            SpaceEvent(PROFILE_CHANGED, work["id"], {"user_id": own_id}),
        ],
        key=lambda event: event.space_id,
    )


def test_changes_other_people_never_see_are_not_announced(
    people: People, runtime: Runtime, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = people.as_(ALEX)
    space = create_space(client, "Goa trip")
    client.patch("/api/me", json={"display_name": "Alex Smith", "about": "Plans the trips"})
    published = watch_events(runtime, monkeypatch)

    client.patch(
        "/api/me",
        json={
            "time_zone": "Asia/Kolkata",
            "email_frequency": "daily",
            "default_space_id": space["id"],
        },
    )
    client.patch("/api/me", json={"display_name": "Alex Smith", "about": "Plans the trips"})
    rejected = client.patch("/api/me", json={"about": "x" * 161})

    assert rejected.status_code == 422
    assert published == []


@pytest.mark.parametrize("old_name", ["Asia/Calcutta", "Europe/Kiev", "America/Buenos_Aires"])
def test_the_older_names_browsers_still_report_for_a_time_zone_are_accepted(
    people: People, old_name: str
) -> None:
    client = people.as_(ALEX)

    response = client.patch("/api/me", json={"time_zone": old_name})

    assert response.status_code == 200
    assert response.json()["time_zone"] == old_name
