from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid
from typing import Protocol

import httpx

from orbit.config import Settings
from orbit.limits import EMAIL_MAX_ATTEMPTS
from orbit.timeutil import utcnow

logger = logging.getLogger("orbit.email")

SMTP_TIMEOUT_SECONDS = 20
SMTPS_PORT = 465
RETRY_BACKOFF = timedelta(seconds=30)
RESEND_API_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str | None = None


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class LogSender:
    def send(self, message: EmailMessage) -> None:
        logger.info(
            "Email not sent because SMTP is not configured. Printing it instead.\n"
            "To: %s\nSubject: %s\n\n%s",
            message.to,
            message.subject,
            message.text,
        )


class SmtpSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _build(self, message: EmailMessage) -> MimeMessage:
        mime = MimeMessage()
        mime["From"] = self._settings.email_from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime["Date"] = formatdate(localtime=False)
        mime["Message-ID"] = make_msgid(domain=self._settings.base_hostname or "orbit.local")
        mime.set_content(message.text)
        if message.html:
            mime.add_alternative(message.html, subtype="html")
        return mime

    def send(self, message: EmailMessage) -> None:
        settings = self._settings
        mime = self._build(message)
        context = ssl.create_default_context()
        if settings.smtp_port == SMTPS_PORT:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=SMTP_TIMEOUT_SECONDS,
                context=context,
            ) as smtp:
                self._deliver(smtp, mime)
            return
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        ) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls(context=context)
                smtp.ehlo()
            elif settings.smtp_user:
                raise smtplib.SMTPNotSupportedError(
                    "The SMTP server does not offer STARTTLS, so credentials were not sent."
                )
            self._deliver(smtp, mime)

    def _deliver(self, smtp: smtplib.SMTP, mime: MimeMessage) -> None:
        if self._settings.smtp_user:
            smtp.login(self._settings.smtp_user, self._settings.smtp_password)
        smtp.send_message(mime)


class ResendError(RuntimeError):
    pass


class ResendSender:
    """Sends through Resend's HTTPS API, for hosts that block outbound SMTP (such as Railway)."""

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self._settings = settings
        self._transport = transport

    def send(self, message: EmailMessage) -> None:
        payload: dict[str, object] = {
            "from": self._settings.email_from,
            "to": [message.to],
            "subject": message.subject,
            "text": message.text,
        }
        if message.html:
            payload["html"] = message.html
        with httpx.Client(timeout=SMTP_TIMEOUT_SECONDS, transport=self._transport) as client:
            response = client.post(
                RESEND_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {self._settings.resend_api_key}"},
            )
        if response.is_success:
            return
        try:
            reason = str(response.json().get("message", ""))
        except ValueError:
            reason = ""
        raise ResendError(f"Resend answered {response.status_code}: {reason}".rstrip(": "))


def default_sender(settings: Settings) -> EmailSender:
    if settings.resend_api_key:
        return ResendSender(settings)
    return SmtpSender(settings) if settings.smtp_configured else LogSender()


def _describe_failure(exc: Exception) -> str:
    # Only Resend's own reason is safe to show; other errors (SMTP refusals in particular)
    # can quote the recipient, so for those the log names the error type alone.
    if isinstance(exc, ResendError):
        return str(exc)
    return type(exc).__name__


@dataclass
class _Queued:
    message: EmailMessage
    attempts: int = 0
    not_before: datetime | None = None


class Mailer:
    def __init__(self, sender: EmailSender, clock: Callable[[], datetime] = utcnow) -> None:
        self.sender = sender
        self._clock = clock
        self._queue: deque[_Queued] = deque()
        self._lock = threading.Lock()

    @property
    def pending_count(self) -> int:
        with self._lock:
            return len(self._queue)

    def enqueue(self, message: EmailMessage) -> None:
        with self._lock:
            self._queue.append(_Queued(message))

    def drain(self) -> int:
        sent = 0
        now = self._clock()
        with self._lock:
            batch = list(self._queue)
            self._queue.clear()
        retry: list[_Queued] = []
        for queued in batch:
            if queued.not_before is not None and queued.not_before > now:
                retry.append(queued)
                continue
            try:
                self.sender.send(queued.message)
                sent += 1
            except Exception as exc:
                queued.attempts += 1
                cause = _describe_failure(exc)
                if queued.attempts < EMAIL_MAX_ATTEMPTS:
                    queued.not_before = now + RETRY_BACKOFF * queued.attempts
                    retry.append(queued)
                    logger.warning("Sending an email failed (%s). It will be retried.", cause)
                else:
                    logger.error(
                        "Sending an email failed after %d attempts (%s).", queued.attempts, cause
                    )
        if retry:
            with self._lock:
                self._queue.extendleft(reversed(retry))
        return sent

    async def run(self, interval_seconds: float = 1.0) -> None:
        while True:
            await asyncio.sleep(interval_seconds)
            await asyncio.to_thread(self.drain)
