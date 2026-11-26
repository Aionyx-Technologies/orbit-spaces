from __future__ import annotations

import hashlib
import hmac
import ipaddress
import re
import secrets
from collections.abc import Callable
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from email_validator import EmailNotValidError, validate_email
from itsdangerous import BadData, URLSafeSerializer

from orbit.errors import InvalidInput
from orbit.limits import DISPLAY_NAME_MAX
from orbit.timeutil import utcnow

MAX_EMAIL_LENGTH = 320
MAX_NEXT_LENGTH = 2048
ISSUED_AT_KEY = "_iat"
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def rate_limit_address(address: str) -> str:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return address
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return f"{ipaddress.ip_network(f'{ip}/64', strict=False).network_address}/64"
    return str(ip)


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def normalize_email(raw: str) -> str:
    candidate = raw.strip()
    if not candidate or len(candidate) > MAX_EMAIL_LENGTH:
        raise InvalidInput("Enter a valid email address.")
    try:
        result = validate_email(candidate, check_deliverability=False)
    except EmailNotValidError as exc:
        raise InvalidInput("Enter a valid email address.") from exc
    return result.normalized.lower()


def display_name_from_email(email: str) -> str:
    local = email.split("@", 1)[0]
    words = [word for word in re.split(r"[._\-+]+", local) if word]
    name = " ".join(word.capitalize() for word in words) or "Member"
    return name[:DISPLAY_NAME_MAX]


def safe_next_path(raw: str | None, default: str = "/spaces") -> str:
    if not raw:
        return default
    if len(raw) > MAX_NEXT_LENGTH or _CONTROL.search(raw) or "\\" in raw:
        return default
    if not raw.startswith("/") or raw.startswith("//"):
        return default
    parsed = urlparse(raw)
    if parsed.scheme or parsed.netloc:
        return default
    return raw


class Signer:
    def __init__(self, secret_key: str, clock: Callable[[], datetime] = utcnow) -> None:
        self._secret_key = secret_key
        self._clock = clock

    def _serializer(self, purpose: str) -> URLSafeSerializer:
        return URLSafeSerializer(self._secret_key, salt=f"orbit:{purpose}")

    def sign(self, payload: dict[str, Any], purpose: str) -> str:
        stamped = {**payload, ISSUED_AT_KEY: int(self._clock().timestamp())}
        return self._serializer(purpose).dumps(stamped)

    def unsign(self, token: str, purpose: str, max_age_seconds: int) -> dict[str, Any] | None:
        try:
            value = self._serializer(purpose).loads(token)
        except BadData:
            return None
        if not isinstance(value, dict):
            return None
        issued_at = value.pop(ISSUED_AT_KEY, None)
        if not isinstance(issued_at, int):
            return None
        if self._clock().timestamp() - issued_at > max_age_seconds:
            return None
        return value

    def derive_client_secret(self, client_id: str) -> str:
        digest = hmac.new(
            self._secret_key.encode("utf-8"),
            f"orbit:client-secret:{client_id}".encode(),
            hashlib.sha256,
        )
        return digest.hexdigest()
