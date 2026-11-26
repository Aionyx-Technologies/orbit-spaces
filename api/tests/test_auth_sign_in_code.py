"""Signing in with the code from the email, in the window that asked for it.

Assistants run their sign-in in a separate in-app browser. The emailed link
opens in a different browser, so the code lets the person finish in the
window that started the connection.
"""

from __future__ import annotations

import re

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import func, select

from orbit.db import session_scope
from orbit.limits import SIGN_IN_CODE_ATTEMPTS, SIGN_IN_CODE_GUESSES_PER_EMAIL
from orbit.models import MagicLink, User
from orbit.runtime import Runtime
from tests.auth_helpers import open_sign_in_link
from tests.conftest import FakeClock, RecordingSender

EMAIL = "alex@example.com"
CODE_IN_EMAIL = re.compile(r"\b(\d{4}) (\d{4})\b")
REQUEST_FIELD = re.compile(r'name="request" value="([^"]+)"')


def ask(client: TestClient, runtime: Runtime, next_path: str = "/spaces") -> str:
    response = client.post("/auth/sign-in", data={"email": EMAIL, "next": next_path})
    assert response.status_code == 200
    runtime.env.mailer.drain()
    match = REQUEST_FIELD.search(response.text)
    assert match is not None
    return match.group(1)


def emailed_code(sender: RecordingSender) -> str:
    match = CODE_IN_EMAIL.search(sender.to(EMAIL)[-1].text)
    assert match is not None
    return match.group(1) + match.group(2)


def enter(client: TestClient, request: str, code: str, next_path: str = "/spaces") -> Response:
    return client.post("/auth/code", data={"request": request, "code": code, "next": next_path})


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 100_000_000:08d}"


def test_the_email_carries_an_eight_digit_code_in_text_and_html(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask(client, runtime)
    message = sender.to(EMAIL)[-1]

    code = emailed_code(sender)
    assert message.html is not None
    assert f"{code[:4]} {code[4:]}" in message.html


def test_the_check_email_page_offers_a_code_box(client: TestClient, runtime: Runtime) -> None:
    response = client.post("/auth/sign-in", data={"email": EMAIL, "next": "/spaces/abc"})

    assert 'action="/auth/code"' in response.text
    assert 'name="code"' in response.text
    assert 'autocomplete="one-time-code"' in response.text
    assert 'name="next" value="/spaces/abc"' in response.text


def test_the_code_signs_in_the_window_that_asked_and_goes_onward(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime, "/oauth/consent?request=abc")

    response = enter(client, request, emailed_code(sender), "/oauth/consent?request=abc")

    assert response.status_code == 303
    assert response.headers["location"] == "/oauth/consent?request=abc"
    cookie = response.headers["set-cookie"].lower()
    assert "orbit_session=" in cookie
    assert "httponly" in cookie


def test_spaces_and_dashes_in_the_code_are_forgiven(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)
    code = emailed_code(sender)

    response = enter(client, request, f" {code[:4]}-{code[4:]} ")

    assert response.status_code == 303


def test_the_code_and_the_link_are_one_sign_in_used_once(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)
    assert enter(client, request, emailed_code(sender)).status_code == 303
    client.cookies.clear()

    again = enter(client, request, emailed_code(sender))
    link = open_sign_in_link(client, sender.last_link(EMAIL))

    assert again.status_code == 400
    assert "set-cookie" not in again.headers
    assert link.status_code == 400


def test_using_the_link_first_spends_the_code(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)
    assert open_sign_in_link(client, sender.last_link(EMAIL)).status_code == 303
    client.cookies.clear()

    response = enter(client, request, emailed_code(sender))

    assert response.status_code == 400


def test_a_wrong_code_keeps_the_page_and_says_so(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)

    response = enter(client, request, wrong(emailed_code(sender)))

    assert response.status_code == 400
    assert "That code did not work" in response.text
    assert 'action="/auth/code"' in response.text
    assert f'name="request" value="{request}"' in response.text
    assert "set-cookie" not in response.headers
    assert enter(client, request, emailed_code(sender)).status_code == 303


def test_too_many_wrong_codes_burn_the_sign_in(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)
    code = emailed_code(sender)
    for _ in range(SIGN_IN_CODE_ATTEMPTS):
        assert enter(client, request, wrong(code)).status_code == 400

    right_but_late = enter(client, request, code)
    link = open_sign_in_link(client, sender.last_link(EMAIL))

    assert right_but_late.status_code == 400
    assert "set-cookie" not in right_but_late.headers
    assert link.status_code == 400


def test_guesses_for_one_email_are_capped_across_fresh_requests(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    allowed, _window = SIGN_IN_CODE_GUESSES_PER_EMAIL
    guesses = 0
    while guesses < allowed:
        request = ask(client, runtime)
        code = emailed_code(sender)
        for _ in range(min(SIGN_IN_CODE_ATTEMPTS, allowed - guesses)):
            assert enter(client, request, wrong(code)).status_code == 400
            guesses += 1
        clock.advance(hours=1, minutes=1)
    request = ask(client, runtime)

    blocked = enter(client, request, emailed_code(sender))

    assert blocked.status_code == 429
    assert "Too many attempts" in blocked.text
    assert "set-cookie" not in blocked.headers


def test_the_code_expires_with_the_link(
    client: TestClient, runtime: Runtime, sender: RecordingSender, clock: FakeClock
) -> None:
    request = ask(client, runtime)
    clock.advance(minutes=16)

    response = enter(client, request, emailed_code(sender))

    assert response.status_code == 400
    assert "set-cookie" not in response.headers


def test_a_code_without_its_request_does_nothing(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask(client, runtime)
    code = emailed_code(sender)

    missing = enter(client, "", code)
    made_up = enter(client, "made-up-request", code)

    assert missing.status_code == 400
    assert made_up.status_code == 400
    with session_scope(runtime.session_factory) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0


def test_the_code_is_never_stored_in_the_clear(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    ask(client, runtime)
    code = emailed_code(sender)

    with session_scope(runtime.session_factory) as db:
        row = db.scalars(select(MagicLink)).one()

    assert row.code_hash is not None
    assert code not in row.code_hash


def test_entering_a_code_needs_the_sites_own_origin(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)

    foreign = client.post(
        "/auth/code",
        data={"request": request, "code": emailed_code(sender), "next": "/spaces"},
        headers={"Origin": "https://evil.example"},
    )

    assert foreign.status_code == 403
    assert enter(client, request, emailed_code(sender)).status_code == 303


def test_the_code_cannot_send_you_off_site(
    client: TestClient, runtime: Runtime, sender: RecordingSender
) -> None:
    request = ask(client, runtime)

    response = enter(client, request, emailed_code(sender), "https://evil.example")

    assert response.headers["location"] == "/spaces"
