from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import func, select

from orbit.config import Settings
from orbit.db import session_scope
from orbit.limits import SIGN_IN_PER_EMAIL, SIGN_IN_PER_IP
from orbit.main import Overrides, create_app
from orbit.models import Invite, MagicLink, Space, User, Waitlist, WebSession
from orbit.runtime import Runtime
from orbit.security import hash_token
from tests.auth_helpers import open_sign_in_link
from tests.conftest import BASE_URL, FakeClock, RecordingSender

EMAIL = "alex@example.com"


def ask_for_link(client: TestClient, email: str = EMAIL, **fields: str) -> Response:
    return client.post("/auth/sign-in", data={"email": email, **fields})


def sign_in(
    client: TestClient, runtime: Runtime, sender: RecordingSender, email: str = EMAIL, **fields: str
) -> Response:
    assert ask_for_link(client, email, **fields).status_code == 200
    runtime.env.mailer.drain()
    return open_sign_in_link(client, sender.last_link(email))


def user_count(runtime: Runtime) -> int:
    with session_scope(runtime.session_factory) as db:
        return db.scalar(select(func.count()).select_from(User)) or 0


def test_the_sign_in_page_is_a_polished_hardened_form(client: TestClient) -> None:
    response = client.get("/auth/sign-in")

    assert response.status_code == 200
    assert 'name="email"' in response.text
    assert "color-scheme: light dark" in response.text
    assert "light-dark(" in response.text
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "same-origin"


def test_the_sign_in_page_says_what_happens_after_the_email_is_sent(client: TestClient) -> None:
    response = client.get("/auth/sign-in")

    assert "What happens next" in response.text
    assert "Open its link within 15 minutes. It works once." in response.text
    assert "The same link sets up your account." in response.text
    assert 'placeholder="name@company.com"' in response.text
    assert "you@example.com" not in response.text


def test_the_pages_use_the_bundled_fonts_from_the_same_origin_and_nothing_else(
    client: TestClient,
) -> None:
    response = client.get("/auth/sign-in")
    policy = response.headers["content-security-policy"]

    assert "/fonts/geist-latin-wght-normal.woff2" in response.text
    assert "instrument-serif" not in response.text
    assert "Instrument Serif" not in response.text
    assert "font-src 'self'" in policy
    assert "default-src 'none'" in policy
    assert "script-src" not in policy
    assert "https://" not in policy


def test_asking_for_a_link_sends_one_email_with_a_working_link(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    response = ask_for_link(client)
    runtime.env.mailer.drain()

    assert response.status_code == 200
    assert "Check your email" in response.text
    assert len(sender.to(EMAIL)) == 1
    message = sender.to(EMAIL)[0]
    assert message.subject == "Your Orbit sign-in link"
    assert "expires in 15 minutes" in message.text
    assert message.html is not None
    link = urlparse(sender.last_link(EMAIL))
    assert f"{link.scheme}://{link.netloc}" == BASE_URL
    assert link.path == "/auth/verify"
    assert parse_qs(link.query)["next"] == ["/spaces"]


def test_the_link_signs_you_in_with_a_hardened_cookie_and_goes_onward(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    response = sign_in(client, runtime, sender, next="/spaces/abc")

    assert response.status_code == 303
    assert response.headers["location"] == "/spaces/abc"
    cookie = response.headers["set-cookie"].lower()
    assert "orbit_session=" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=2592000" in cookie
    assert "path=/" in cookie


def test_the_session_is_stored_only_as_a_hash(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)
    token = client.cookies["orbit_session"]

    with session_scope(runtime.session_factory) as db:
        rows = db.scalars(select(WebSession)).all()

    assert [row.token_hash for row in rows] == [hash_token(token)]
    assert token not in rows[0].token_hash


def test_a_signed_in_visitor_is_sent_straight_onward(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)

    response = client.get("/auth/sign-in?next=/spaces/xyz")

    assert response.status_code == 303
    assert response.headers["location"] == "/spaces/xyz"


def test_the_link_works_once_only(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)

    again = open_sign_in_link(client, sender.last_link(EMAIL))

    assert again.status_code == 400
    assert "That link did not work" in again.text
    assert "set-cookie" not in again.headers


def test_the_link_expires_after_fifteen_minutes(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    ask_for_link(client)
    runtime.env.mailer.drain()
    clock.advance(minutes=16)

    response = open_sign_in_link(client, sender.last_link(EMAIL))

    assert response.status_code == 400
    assert "set-cookie" not in response.headers


def test_the_link_is_stored_only_as_a_hash(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client)
    runtime.env.mailer.drain()
    token = parse_qs(urlparse(sender.last_link(EMAIL)).query)["token"][0]

    with session_scope(runtime.session_factory) as db:
        rows = db.scalars(select(MagicLink)).all()

    assert [row.token_hash for row in rows] == [hash_token(token)]


def test_a_random_token_is_rejected(client: TestClient) -> None:
    response = client.post("/auth/verify", data={"token": "nonsense", "next": "/spaces"})

    assert response.status_code == 400
    assert "That link did not work" in response.text
    assert "set-cookie" not in response.headers


def test_opening_the_link_only_asks_for_confirmation_and_leaves_it_unused(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client, next="/spaces/abc")
    runtime.env.mailer.drain()
    link = sender.last_link(EMAIL)

    first_look = client.get(link)
    second_look = client.get(link)

    assert first_look.status_code == 200
    assert second_look.status_code == 200
    assert "Continue to Orbit" in first_look.text
    assert 'action="/auth/verify"' in first_look.text
    assert 'name="next" value="/spaces/abc"' in first_look.text
    assert "set-cookie" not in first_look.headers
    assert first_look.headers["cache-control"] == "no-store"
    assert user_count(runtime) == 0
    confirmed = open_sign_in_link(client, link)
    assert confirmed.status_code == 303
    assert confirmed.headers["location"] == "/spaces/abc"
    assert "orbit_session=" in confirmed.headers["set-cookie"]


def test_the_confirmation_page_never_repeats_an_unsafe_destination(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client)
    runtime.env.mailer.drain()
    token = parse_qs(urlparse(sender.last_link(EMAIL)).query)["token"][0]

    response = client.get("/auth/verify", params={"token": token, "next": "https://evil.example"})

    assert 'name="next" value="/spaces"' in response.text
    assert "evil.example" not in response.text


def test_the_confirmation_page_says_which_account_it_will_sign_in(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client)
    runtime.env.mailer.drain()

    response = client.get(sender.last_link(EMAIL))

    assert response.status_code == 200
    assert f"<strong>{EMAIL}</strong>" in response.text


def test_the_confirmation_page_refuses_a_link_that_is_unknown_or_used(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    assert client.get("/auth/verify", params={"token": "nonsense"}).status_code == 400
    ask_for_link(client)
    runtime.env.mailer.drain()
    link = sender.last_link(EMAIL)
    assert open_sign_in_link(client, link).status_code == 303
    client.cookies.clear()

    again = client.get(link)

    assert again.status_code == 400
    assert "That link did not work" in again.text


def test_the_confirmation_page_without_a_token_explains_the_problem(client: TestClient) -> None:
    response = client.get("/auth/verify")

    assert response.status_code == 400
    assert "That link did not work" in response.text


def test_confirming_needs_the_sites_own_origin_and_keeps_the_link_alive(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client)
    runtime.env.mailer.drain()
    link = sender.last_link(EMAIL)
    token = parse_qs(urlparse(link).query)["token"][0]

    foreign = client.post(
        "/auth/verify",
        data={"token": token, "next": "/spaces"},
        headers={"Origin": "https://evil.example"},
    )

    assert foreign.status_code == 403
    assert "set-cookie" not in foreign.headers
    assert open_sign_in_link(client, link).status_code == 303


def test_a_new_person_gets_an_account_named_from_their_email(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender, email="blake.jones@example.com")

    with session_scope(runtime.session_factory) as db:
        user = db.scalar(select(User))

    assert user is not None
    assert user.email == "blake.jones@example.com"
    assert user.display_name == "Blake Jones"


def test_signing_in_again_reuses_the_account(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)
    client.cookies.clear()
    sign_in(client, runtime, sender)

    assert user_count(runtime) == 1


def test_emails_are_normalised(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask_for_link(client, "  Alex@Example.COM ")
    runtime.env.mailer.drain()
    open_sign_in_link(client, sender.last_link("alex@example.com"))
    client.cookies.clear()
    sign_in(client, runtime, sender, email="alex@example.com")

    assert user_count(runtime) == 1
    assert len(sender.to("alex@example.com")) == 2


def test_a_bad_email_gets_a_helpful_message(client: TestClient, sender: RecordingSender) -> None:
    response = ask_for_link(client, "not-an-email")

    assert response.status_code == 422
    assert "Enter a valid email address." in response.text
    assert sender.messages == []


def test_the_json_flavour_reports_the_outcome_without_a_page(
    client: TestClient, runtime: Runtime
) -> None:
    sent = client.post(
        "/auth/sign-in", data={"email": EMAIL}, headers={"Accept": "application/json"}
    )
    bad = client.post(
        "/auth/sign-in", data={"email": "nope"}, headers={"Accept": "application/json"}
    )

    assert sent.json() == {"status": "sent"}
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "invalid_input"


@pytest.mark.parametrize(
    "hostile", ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]
)
def test_next_cannot_be_used_to_leave_the_site(
    client: TestClient, runtime: Runtime, sender: RecordingSender, hostile: str
) -> None:
    ask_for_link(client, next=hostile)
    runtime.env.mailer.drain()
    link = sender.last_link(EMAIL)

    assert parse_qs(urlparse(link).query)["next"] == ["/spaces"]
    forged = link.replace("next=%2Fspaces", f"next={hostile}")
    response = open_sign_in_link(client, forged)
    assert response.headers["location"] == "/spaces"


def test_posting_without_the_sites_own_origin_is_refused(
    client: TestClient, sender: RecordingSender
) -> None:
    foreign = client.post(
        "/auth/sign-in", data={"email": EMAIL}, headers={"Origin": "https://evil.example"}
    )
    null_origin = client.post("/auth/sign-in", data={"email": EMAIL}, headers={"Origin": "null"})

    assert foreign.status_code == 403
    assert null_origin.status_code == 403
    assert sender.messages == []


def test_a_referer_from_the_site_stands_in_when_there_is_no_origin(app: FastAPI) -> None:
    with TestClient(app, base_url=BASE_URL, follow_redirects=False) as bare:
        ok = bare.post(
            "/auth/sign-in", data={"email": EMAIL}, headers={"Referer": f"{BASE_URL}/auth/sign-in"}
        )
        missing = bare.post("/auth/sign-in", data={"email": EMAIL})

    assert ok.status_code == 200
    assert missing.status_code == 403


def test_asking_too_often_for_one_email_is_limited(client: TestClient) -> None:
    allowed, _window = SIGN_IN_PER_EMAIL
    for _ in range(allowed):
        assert ask_for_link(client).status_code == 200

    blocked = ask_for_link(client)

    assert blocked.status_code == 429
    assert "Too many attempts" in blocked.text


def test_asking_too_often_from_one_address_is_limited(client: TestClient) -> None:
    allowed, _window = SIGN_IN_PER_IP
    for index in range(allowed):
        assert ask_for_link(client, f"person{index}@example.com").status_code == 200

    blocked = ask_for_link(client, "one-more@example.com")

    assert blocked.status_code == 429


def test_limits_reset_after_the_window(client: TestClient, clock: FakeClock) -> None:
    allowed, window = SIGN_IN_PER_EMAIL
    for _ in range(allowed):
        ask_for_link(client)
    assert ask_for_link(client).status_code == 429

    clock.advance(seconds=window.total_seconds() + 5)

    assert ask_for_link(client).status_code == 200


def private_site(
    settings: Settings, clock: FakeClock, sender: RecordingSender, allowed: str
) -> tuple[TestClient, Runtime]:
    restricted = settings.model_copy(update={"allowed_emails_raw": allowed})
    app = create_app(restricted, overrides=Overrides(clock=clock, sender=sender))
    runtime: Runtime = app.state.runtime
    site = TestClient(app, base_url=BASE_URL, follow_redirects=False, headers={"Origin": BASE_URL})
    return site, runtime


def test_an_email_off_the_allowlist_sees_private_testing_and_gets_no_link(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, _runtime = private_site(settings, clock, sender, "alex@example.com")
    with site as client:
        response = ask_for_link(client, "stranger@example.com")

    assert response.status_code == 403
    assert "Orbit is in a small orbit for now" in response.text
    assert 'action="/auth/waitlist"' in response.text
    assert sender.messages == []


def test_an_allowlisted_email_signs_in_normally(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, runtime = private_site(settings, clock, sender, "Alex@Example.com, blake@example.com")
    with site as client:
        response = ask_for_link(client, "alex@example.com")
        runtime.env.mailer.drain()

    assert response.status_code == 200
    assert len(sender.to("alex@example.com")) == 1


def make_invite(
    runtime: Runtime,
    token: str,
    *,
    expires_in: timedelta,
    accepted: bool = False,
    email: str | None = None,
) -> None:
    now = runtime.env.now()
    with session_scope(runtime.session_factory) as db:
        owner = User(id="owner-id", email="owner@example.com", display_name="Owner", created_at=now)
        db.add(owner)
        db.flush()
        db.add(Space(id="space-id", name="Goa", created_by="owner-id", created_at=now))
        db.flush()
        db.add(
            Invite(
                token_hash=hash_token(token),
                space_id="space-id",
                invited_by="owner-id",
                email=email,
                expires_at=now + expires_in,
                accepted_by="owner-id" if accepted else None,
                accepted_at=now if accepted else None,
                revoked_at=None,
            )
        )
        db.commit()


def test_anyone_holding_a_valid_invite_may_sign_up_despite_the_allowlist(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, runtime = private_site(settings, clock, sender, "owner@example.com")
    with site as client:
        make_invite(runtime, "valid-invite-token", expires_in=timedelta(days=7))
        response = ask_for_link(client, "guest@example.com", invite="valid-invite-token")
        runtime.env.mailer.drain()

    assert response.status_code == 200
    assert len(sender.to("guest@example.com")) == 1


def test_an_invite_sent_to_one_address_does_not_open_the_list_to_anyone_else(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, runtime = private_site(settings, clock, sender, "owner@example.com")
    with site as client:
        make_invite(
            runtime, "bound-invite", expires_in=timedelta(days=7), email="partner@example.com"
        )
        stranger = ask_for_link(client, "stranger@example.com", invite="bound-invite")
        partner = ask_for_link(client, "  Partner@Example.com ", invite="bound-invite")
        runtime.env.mailer.drain()

    assert stranger.status_code == 403
    assert partner.status_code == 200
    assert sender.to("stranger@example.com") == []
    assert len(sender.to("partner@example.com")) == 1


@pytest.mark.parametrize(
    ("label", "expires_in", "accepted", "token"),
    [
        ("expired", timedelta(days=-1), False, "the-token"),
        ("already used", timedelta(days=7), True, "the-token"),
        ("unknown", timedelta(days=7), False, "a-different-token"),
    ],
)
def test_an_unusable_invite_does_not_bypass_the_allowlist(
    settings: Settings,
    clock: FakeClock,
    sender: RecordingSender,
    label: str,
    expires_in: timedelta,
    accepted: bool,
    token: str,
) -> None:
    site, runtime = private_site(settings, clock, sender, "owner@example.com")
    with site as client:
        make_invite(runtime, "the-token", expires_in=expires_in, accepted=accepted)
        response = ask_for_link(client, "guest@example.com", invite=token)

    assert response.status_code == 403, label
    assert sender.messages == []


def test_the_waitlist_stores_each_address_once(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, runtime = private_site(settings, clock, sender, "owner@example.com")
    with site as client:
        first = client.post("/auth/waitlist", data={"email": "Hopeful@Example.com"})
        second = client.post("/auth/waitlist", data={"email": "hopeful@example.com"})
        with session_scope(runtime.session_factory) as db:
            rows = db.scalars(select(Waitlist)).all()

    assert first.status_code == 200
    assert "You are on the list" in first.text
    assert second.status_code == 200
    assert [row.email for row in rows] == ["hopeful@example.com"]


def test_the_waitlist_rejects_bad_emails(client: TestClient) -> None:
    response = client.post("/auth/waitlist", data={"email": "nope"})

    assert response.status_code == 422


def test_signing_out_ends_the_session_and_clears_the_cookie(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)

    response = client.post("/auth/sign-out")

    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert 'orbit_session=""' in response.headers["set-cookie"] or "max-age=0" in (
        response.headers["set-cookie"].lower()
    )
    with session_scope(runtime.session_factory) as db:
        assert db.scalars(select(WebSession)).all() == []


def test_signing_out_can_send_you_back_to_sign_in_somewhere_specific(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)

    response = client.post("/auth/sign-out", data={"next": "/oauth/consent?request=abc"})

    assert response.headers["location"] == "/auth/sign-in?next=%2Foauth%2Fconsent%3Frequest%3Dabc"


def test_signing_out_requires_the_sites_own_origin(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    sign_in(client, runtime, sender)

    response = client.post("/auth/sign-out", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    with session_scope(runtime.session_factory) as db:
        assert len(db.scalars(select(WebSession)).all()) == 1


def test_a_session_expires_after_thirty_days(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    sign_in(client, runtime, sender)
    clock.advance(days=31)

    response = client.get("/auth/sign-in")

    assert response.status_code == 200
    assert 'name="email"' in response.text


def test_the_cookie_is_not_marked_secure_on_plain_localhost(
    tmp_path: Path, clock: FakeClock, sender: RecordingSender
) -> None:
    local = Settings(
        _env_file=None,
        base_url="http://localhost:3000",
        secret_key="x" * 48,
        database_url=f"sqlite:///{tmp_path / 'local.db'}",
    )
    app = create_app(local, overrides=Overrides(clock=clock, sender=sender))
    with TestClient(
        app,
        base_url="http://localhost:3000",
        follow_redirects=False,
        headers={"Origin": "http://localhost:3000"},
    ) as local_client:
        ask_for_link(local_client)
        app.state.runtime.env.mailer.drain()
        response = open_sign_in_link(local_client, sender.last_link(EMAIL))

    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" not in cookie


def test_people_with_an_account_can_still_sign_in_when_the_allowlist_is_on(
    settings: Settings, clock: FakeClock, sender: RecordingSender
) -> None:
    site, runtime = private_site(settings, clock, sender, "owner@example.com")
    with site as client:
        with session_scope(runtime.session_factory) as db:
            db.add(
                User(
                    id="partner-id",
                    email="partner@example.com",
                    display_name="Partner",
                    created_at=runtime.env.now(),
                )
            )
            db.commit()
        known = ask_for_link(client, "partner@example.com")
        stranger = ask_for_link(client, "stranger@example.com")
        runtime.env.mailer.drain()

    assert known.status_code == 200
    assert len(sender.to("partner@example.com")) == 1
    assert stranger.status_code == 403
    assert sender.to("stranger@example.com") == []
