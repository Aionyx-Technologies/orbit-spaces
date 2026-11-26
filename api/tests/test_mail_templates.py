from __future__ import annotations

import pytest

from orbit.email import EmailMessage
from orbit.mail_templates import (
    activity_message,
    daily_summary_message,
    invite_accepted_message,
    invite_message,
    logo_url,
    sign_in_message,
)

LOGO = '<img src="https://orbit.example/apple-icon.png"'


def test_the_logo_comes_from_the_same_server_as_the_link() -> None:
    assert (
        logo_url("https://orbit.example/auth/verify?token=abc&next=%2Fspaces")
        == "https://orbit.example/apple-icon.png"
    )
    assert logo_url("http://localhost:3000/invite/xyz") == "http://localhost:3000/apple-icon.png"


@pytest.mark.parametrize(
    "message",
    [
        sign_in_message(
            "a@example.com", "https://orbit.example/auth/verify?token=t", "1234 5678", 15
        ),
        invite_message("a@example.com", "Alex", "Plans", "https://orbit.example/invite/i", 7),
        activity_message(
            "a@example.com",
            "New in Plans",
            "Plans",
            ["Alex shared a note"],
            0,
            "https://orbit.example/spaces/s",
            "https://orbit.example/settings",
        ),
        daily_summary_message(
            "a@example.com",
            "Your day in Orbit",
            "20 November",
            [],
            "https://orbit.example/settings",
        ),
        invite_accepted_message(
            "a@example.com",
            "Blake",
            "Plans",
            "https://orbit.example/spaces/s",
            "https://orbit.example/settings",
        ),
    ],
    ids=["sign-in", "invite", "activity", "daily-summary", "invite-accepted"],
)
def test_every_email_shows_the_png_logo_beside_the_name(message: EmailMessage) -> None:
    assert message.html is not None
    assert LOGO in message.html
    assert 'width="28" height="28" alt=""' in message.html
    assert ">Orbit</td>" in message.html
    assert "apple-icon.png" not in message.text


def test_an_invite_email_points_assistant_users_to_their_invitations() -> None:
    message = invite_message("a@example.com", "Alex", "Plans", "https://orbit.example/invite/i", 7)

    assert message.html is not None
    for text in (message.text, message.html):
        assert "Already use Orbit with an AI assistant?" in text
        assert "Ask it to show your Orbit invitations." in text


def test_a_summary_that_holds_back_updates_says_why() -> None:
    held = daily_summary_message(
        "a@example.com",
        "Your Orbit summary",
        "20 November",
        [],
        "https://orbit.example/settings",
        held_back_limit=5,
    )
    plain = daily_summary_message(
        "a@example.com",
        "Your Orbit summary",
        "20 November",
        [],
        "https://orbit.example/settings",
    )

    assert held.html is not None
    for text in (held.text, held.html):
        assert "limit of 5 update emails a day" in text
    assert "limit of" not in plain.text
    assert plain.html is not None
    assert "limit of" not in plain.html


def test_an_update_email_can_warn_it_is_the_last_one_of_the_day() -> None:
    args = (
        "a@example.com",
        "New in Plans",
        "Plans",
        ["Alex shared a note"],
        0,
        "https://orbit.example/spaces/s",
        "https://orbit.example/settings",
    )
    last = activity_message(*args, limit_note=5)
    ordinary = activity_message(*args)

    assert last.html is not None
    assert ordinary.html is not None
    for text in (last.text, last.html):
        assert "limit of 5 update emails a day" in text
        assert "next morning summary" in text
    assert "limit of" not in ordinary.text
    assert "limit of" not in ordinary.html
