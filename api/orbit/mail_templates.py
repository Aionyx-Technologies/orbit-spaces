from __future__ import annotations

from urllib.parse import urlsplit

from orbit.email import EmailMessage
from orbit.templating import render

LOGO_PATH = "/apple-icon.png"


def logo_url(link: str) -> str:
    """The PNG app icon on the same Orbit server as ``link``; email clients do not show SVG."""
    parts = urlsplit(link)
    return f"{parts.scheme}://{parts.netloc}{LOGO_PATH}"


def sign_in_message(to: str, link: str, code: str, minutes: int) -> EmailMessage:
    subject = "Your Orbit sign-in link"
    context = {
        "link": link,
        "code": code,
        "minutes": minutes,
        "subject": subject,
        "logo_url": logo_url(link),
    }
    return EmailMessage(
        to=to,
        subject=subject,
        text=render("email/sign_in.txt", **context),
        html=render("email/sign_in.html", **context),
    )


def invite_message(
    to: str,
    inviter: str,
    space: str,
    link: str,
    days: int,
    inviter_photo: str | None = None,
) -> EmailMessage:
    subject = f"{inviter} invited you to {space} on Orbit"
    context = {
        "inviter": inviter,
        "space": space,
        "link": link,
        "days": days,
        "subject": subject,
        "inviter_photo": inviter_photo,
        "logo_url": logo_url(link),
    }
    return EmailMessage(
        to=to,
        subject=subject,
        text=render("email/invite.txt", **context),
        html=render("email/invite.html", **context),
    )


def activity_message(
    to: str,
    subject: str,
    space: str,
    lines: list[str],
    more: int,
    link: str,
    settings_link: str,
    limit_note: int = 0,
) -> EmailMessage:
    context = {
        "subject": subject,
        "space": space,
        "limit_note": limit_note,
        "lines": lines,
        "more": more,
        "link": link,
        "settings_link": settings_link,
        "logo_url": logo_url(settings_link),
    }
    return EmailMessage(
        to=to,
        subject=subject,
        text=render("email/activity.txt", **context),
        html=render("email/activity.html", **context),
    )


def daily_summary_message(
    to: str,
    subject: str,
    date: str,
    sections: list[dict[str, object]],
    settings_link: str,
    held_back_limit: int = 0,
) -> EmailMessage:
    context = {
        "subject": subject,
        "date": date,
        "sections": sections,
        "held_back_limit": held_back_limit,
        "settings_link": settings_link,
        "logo_url": logo_url(settings_link),
    }
    return EmailMessage(
        to=to,
        subject=subject,
        text=render("email/daily_summary.txt", **context),
        html=render("email/daily_summary.html", **context),
    )


def invite_accepted_message(
    to: str, joiner: str, space: str, link: str, settings_link: str
) -> EmailMessage:
    subject = f"{joiner} joined {space} on Orbit"
    context = {
        "subject": subject,
        "joiner": joiner,
        "space": space,
        "link": link,
        "settings_link": settings_link,
        "logo_url": logo_url(settings_link),
    }
    return EmailMessage(
        to=to,
        subject=subject,
        text=render("email/invite_accepted.txt", **context),
        html=render("email/invite_accepted.html", **context),
    )
