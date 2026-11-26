from __future__ import annotations

import json
import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage as MimeMessage
from typing import Any

import httpx
import pytest

from orbit.config import Settings
from orbit.email import (
    EmailMessage,
    LogSender,
    Mailer,
    ResendError,
    ResendSender,
    SmtpSender,
    default_sender,
)
from orbit.limits import EMAIL_MAX_ATTEMPTS
from tests.conftest import SECRET_KEY, FakeClock, RecordingSender

MESSAGE = EmailMessage(
    to="alex@example.com",
    subject="Your Orbit sign-in link",
    text="Open https://orbit.test/auth/verify?token=abc",
    html="<p>Open <a href='https://orbit.test/auth/verify?token=abc'>this</a></p>",
)


class FakeSmtp:
    instances: list[FakeSmtp] = []
    offers_starttls = True

    def __init__(self, host: str, port: int, **kwargs: Any) -> None:
        self.host = host
        self.port = port
        self.kwargs = kwargs
        self.calls: list[str] = []
        self.sent: list[MimeMessage] = []
        FakeSmtp.instances.append(self)

    def __enter__(self) -> FakeSmtp:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def ehlo(self) -> None:
        self.calls.append("ehlo")

    def has_extn(self, name: str) -> bool:
        return FakeSmtp.offers_starttls and name == "starttls"

    def starttls(self, context: object) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}:{password}")

    def send_message(self, message: MimeMessage) -> None:
        self.calls.append("send")
        self.sent.append(message)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSmtp.instances = []
    FakeSmtp.offers_starttls = True
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSmtp)


def smtp_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_user": "mailer",
        "smtp_password": "hunter2",
        "email_from": "Orbit <orbit@orbit.test>",
    }
    values.update(overrides)
    return Settings(_env_file=None, secret_key=SECRET_KEY, base_url="https://orbit.test", **values)


def test_with_no_smtp_host_emails_are_printed_to_the_log(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="orbit.email"):
        LogSender().send(MESSAGE)

    logged = caplog.text
    assert "alex@example.com" in logged
    assert "Your Orbit sign-in link" in logged
    assert "https://orbit.test/auth/verify?token=abc" in logged


def test_the_sender_follows_the_configuration() -> None:
    assert isinstance(default_sender(smtp_settings()), SmtpSender)
    assert isinstance(default_sender(smtp_settings(smtp_host="")), LogSender)


def test_a_submission_port_upgrades_to_tls_logs_in_and_sends() -> None:
    SmtpSender(smtp_settings()).send(MESSAGE)

    smtp = FakeSmtp.instances[0]
    assert (smtp.host, smtp.port) == ("smtp.example.com", 587)
    assert smtp.calls == ["ehlo", "starttls", "ehlo", "login:mailer:hunter2", "send"]
    assert smtp.kwargs["timeout"] == 20


def test_the_message_has_the_right_headers_and_both_bodies() -> None:
    SmtpSender(smtp_settings()).send(MESSAGE)

    sent = FakeSmtp.instances[0].sent[0]
    assert sent["From"] == "Orbit <orbit@orbit.test>"
    assert sent["To"] == "alex@example.com"
    assert sent["Subject"] == "Your Orbit sign-in link"
    assert sent["Message-ID"].endswith("@orbit.test>")
    assert sent["Date"]
    assert sent.get_body(preferencelist=("plain",)) is not None
    html_body = sent.get_body(preferencelist=("html",))
    assert html_body is not None
    assert "this</a>" in html_body.get_content()


def test_port_465_uses_implicit_tls() -> None:
    SmtpSender(smtp_settings(smtp_port=465)).send(MESSAGE)

    smtp = FakeSmtp.instances[0]
    assert smtp.port == 465
    assert "starttls" not in smtp.calls
    assert smtp.calls == ["login:mailer:hunter2", "send"]
    assert "context" in smtp.kwargs


def test_credentials_are_never_sent_without_tls() -> None:
    FakeSmtp.offers_starttls = False

    with pytest.raises(smtplib.SMTPNotSupportedError):
        SmtpSender(smtp_settings()).send(MESSAGE)

    assert not any(call.startswith("login") for call in FakeSmtp.instances[0].calls)
    assert FakeSmtp.instances[0].sent == []


def test_a_local_relay_without_credentials_works_without_tls() -> None:
    FakeSmtp.offers_starttls = False

    SmtpSender(smtp_settings(smtp_port=25, smtp_user="", smtp_password="")).send(MESSAGE)

    assert FakeSmtp.instances[0].calls == ["ehlo", "send"]


def test_a_text_only_message_has_no_html_part() -> None:
    SmtpSender(smtp_settings()).send(EmailMessage(to="a@example.com", subject="Hi", text="Plain"))

    sent = FakeSmtp.instances[0].sent[0]
    assert sent.get_body(preferencelist=("html",)) is None


def test_header_injection_through_the_recipient_is_impossible() -> None:
    hostile = EmailMessage(to="a@example.com\r\nBcc: spy@example.com", subject="Hi", text="x")

    with pytest.raises(ValueError, match="linefeed"):
        SmtpSender(smtp_settings()).send(hostile)


def resend_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "resend_api_key": "re_test_key",
        "email_from": "Orbit <orbit@orbit.test>",
    }
    values.update(overrides)
    return Settings(_env_file=None, secret_key=SECRET_KEY, base_url="https://orbit.test", **values)


def test_a_resend_key_selects_the_resend_sender_even_with_smtp_set() -> None:
    assert isinstance(default_sender(resend_settings()), ResendSender)
    assert isinstance(default_sender(resend_settings(smtp_host="smtp.example.com")), ResendSender)


def test_resend_posts_the_message_with_the_api_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "abc"})

    ResendSender(resend_settings(), transport=httpx.MockTransport(handler)).send(MESSAGE)

    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer re_test_key"
    assert json.loads(request.content) == {
        "from": "Orbit <orbit@orbit.test>",
        "to": ["alex@example.com"],
        "subject": "Your Orbit sign-in link",
        "text": MESSAGE.text,
        "html": MESSAGE.html,
    }


def test_resend_leaves_out_html_for_a_text_only_message() -> None:
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "abc"})

    sender = ResendSender(resend_settings(), transport=httpx.MockTransport(handler))
    sender.send(EmailMessage(to="a@example.com", subject="Hi", text="Plain"))

    assert "html" not in bodies[0]


def test_a_resend_error_raises_with_the_reason_but_not_the_message() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403, json={"name": "validation_error", "message": "The domain is not verified."}
        )

    sender = ResendSender(resend_settings(), transport=httpx.MockTransport(handler))

    with pytest.raises(ResendError) as raised:
        sender.send(MESSAGE)

    reason = str(raised.value)
    assert "403" in reason
    assert "The domain is not verified." in reason
    assert "alex@example.com" not in reason
    assert "token=abc" not in reason


def test_a_failed_send_logs_the_kind_of_failure(caplog: pytest.LogCaptureFixture) -> None:
    mailer = Mailer(FlakySender(failures=1), FakeClock())
    mailer.enqueue(MESSAGE)

    with caplog.at_level(logging.WARNING, logger="orbit.email"):
        mailer.drain()

    assert "OSError" in caplog.text
    assert "alex@example.com" not in caplog.text


def test_the_mailer_sends_queued_messages_in_order() -> None:
    sender = RecordingSender()
    mailer = Mailer(sender, FakeClock())
    first = EmailMessage(to="a@example.com", subject="One", text="1")
    second = EmailMessage(to="b@example.com", subject="Two", text="2")
    mailer.enqueue(first)
    mailer.enqueue(second)

    sent = mailer.drain()

    assert sent == 2
    assert sender.messages == [first, second]
    assert mailer.pending_count == 0


class FlakySender:
    def __init__(self, failures: int) -> None:
        self.failures = failures
        self.delivered: list[EmailMessage] = []
        self.attempts = 0

    def send(self, message: EmailMessage) -> None:
        self.attempts += 1
        if self.attempts <= self.failures:
            raise OSError("connection refused")
        self.delivered.append(message)


def test_a_failed_send_is_retried_after_a_pause() -> None:
    clock = FakeClock()
    sender = FlakySender(failures=1)
    mailer = Mailer(sender, clock)
    mailer.enqueue(MESSAGE)

    assert mailer.drain() == 0
    assert mailer.pending_count == 1
    assert mailer.drain() == 0
    assert sender.attempts == 1

    clock.advance(minutes=5)

    assert mailer.drain() == 1
    assert sender.delivered == [MESSAGE]
    assert mailer.pending_count == 0


def test_a_message_is_given_up_on_after_repeated_failures(
    caplog: pytest.LogCaptureFixture,
) -> None:
    clock = FakeClock()
    sender = FlakySender(failures=100)
    mailer = Mailer(sender, clock)
    mailer.enqueue(MESSAGE)

    with caplog.at_level(logging.WARNING, logger="orbit.email"):
        for _ in range(EMAIL_MAX_ATTEMPTS + 2):
            mailer.drain()
            clock.advance(minutes=30)

    assert sender.attempts == EMAIL_MAX_ATTEMPTS
    assert mailer.pending_count == 0
    assert "after 3 attempts" in caplog.text
    assert "alex@example.com" not in caplog.text
    assert "token=abc" not in caplog.text


def test_failure_logs_never_include_the_message() -> None:
    mailer = Mailer(FlakySender(failures=1), FakeClock())
    mailer.enqueue(MESSAGE)

    mailer.drain()

    assert mailer.pending_count == 1


def test_retry_delay_grows_with_each_attempt() -> None:
    clock = FakeClock()
    sender = FlakySender(failures=2)
    mailer = Mailer(sender, clock)
    mailer.enqueue(MESSAGE)
    mailer.drain()
    clock.advance(seconds=40)
    mailer.drain()
    clock.advance(seconds=40)
    assert mailer.drain() == 0
    assert sender.attempts == 2

    clock.advance(seconds=timedelta(minutes=2).total_seconds())

    assert mailer.drain() == 1
