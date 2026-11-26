from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from urllib.parse import quote

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from orbit.db import rows_affected
from orbit.errors import RateLimited
from orbit.limits import (
    MAGIC_LINK_TTL,
    SIGN_IN_CODE_ATTEMPTS,
    SIGN_IN_CODE_DIGITS,
    SIGN_IN_CODE_GUESSES_PER_EMAIL,
    SIGN_IN_PER_EMAIL,
    SIGN_IN_PER_IP,
    WAITLIST_PER_IP,
)
from orbit.mail_templates import sign_in_message
from orbit.models import MagicLink, User, Waitlist, new_id
from orbit.security import (
    constant_time_equals,
    display_name_from_email,
    hash_token,
    new_token,
    normalize_email,
    safe_next_path,
)
from orbit.services.context import Env
from orbit.services.invites import find_usable_invite

PURPOSE_SIGN_IN = "sign_in"
TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a while and try again."
_CODE_SEPARATORS = re.compile(r"[\s-]")
_CODE_SHAPE = re.compile(rf"\d{{{SIGN_IN_CODE_DIGITS}}}")


class SignInOutcome(StrEnum):
    SENT = "sent"
    PRIVATE_TESTING = "private_testing"


@dataclass(frozen=True)
class SignInRequest:
    outcome: SignInOutcome
    email: str
    # Identifies the pending sign-in so its emailed code can be entered in
    # the same window that asked for it. None when no email was sent.
    request: str | None = None


@dataclass(frozen=True)
class CodeCheck:
    user: User | None = None
    # Set when the code was wrong but this sign-in can still be retried.
    retry_email: str | None = None


def is_sign_in_permitted(db: Session, env: Env, email: str, invite_token: str) -> bool:
    allowed = env.settings.allowed_emails
    if not allowed or email in allowed:
        return True
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        return True
    return find_usable_invite(db, env, invite_token, for_email=email) is not None


def _new_code() -> str:
    return f"{secrets.randbelow(10**SIGN_IN_CODE_DIGITS):0{SIGN_IN_CODE_DIGITS}d}"


def _code_hash(env: Env, request: str, code: str) -> str:
    message = f"orbit:sign-in-code:{request}:{code}".encode()
    return hmac.new(env.settings.secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def format_code(code: str) -> str:
    half = len(code) // 2
    return f"{code[:half]} {code[half:]}"


def request_sign_in_link(
    db: Session,
    env: Env,
    raw_email: str,
    next_path: str,
    invite_token: str,
    client_ip: str,
) -> SignInRequest:
    if not env.limiter.allow(f"sign-in:ip:{client_ip}", SIGN_IN_PER_IP):
        raise RateLimited(TOO_MANY_ATTEMPTS)
    email = normalize_email(raw_email)
    if not env.limiter.allow(f"sign-in:email:{email}", SIGN_IN_PER_EMAIL):
        raise RateLimited(TOO_MANY_ATTEMPTS)
    if not is_sign_in_permitted(db, env, email, invite_token):
        return SignInRequest(SignInOutcome.PRIVATE_TESTING, email)
    token = new_token()
    request = hash_token(token)
    code = _new_code()
    db.add(
        MagicLink(
            token_hash=request,
            email=email,
            purpose=PURPOSE_SIGN_IN,
            expires_at=env.now() + MAGIC_LINK_TTL,
            used_at=None,
            code_hash=_code_hash(env, request, code),
            code_attempts=0,
        )
    )
    db.commit()
    target = quote(safe_next_path(next_path), safe="")
    link = f"{env.settings.base_url}/auth/verify?token={token}&next={target}"
    minutes = int(MAGIC_LINK_TTL.total_seconds() // 60)
    env.mailer.enqueue(sign_in_message(email, link, format_code(code), minutes))
    return SignInRequest(SignInOutcome.SENT, email, request)


def _claim(db: Session, digest: str, now: datetime) -> MagicLink | None:
    claimed = db.execute(
        update(MagicLink)
        .where(
            MagicLink.token_hash == digest,
            MagicLink.used_at.is_(None),
            MagicLink.expires_at > now,
        )
        .values(used_at=now)
    )
    if rows_affected(claimed) != 1:
        db.rollback()
        return None
    link = db.get(MagicLink, digest)
    if link is None:
        db.rollback()
    return link


def _find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def _user_for(db: Session, email: str, now: datetime) -> User:
    user = _find_user(db, email)
    if user is None:
        user = User(
            id=new_id(),
            email=email,
            display_name=display_name_from_email(email),
            created_at=now,
        )
        try:
            # A savepoint, so losing a race for this email does not undo the link claim.
            with db.begin_nested():
                db.add(user)
        except IntegrityError:
            user = _find_user(db, email)
            if user is None:
                raise
    db.commit()
    return user


def peek_sign_in_email(db: Session, env: Env, token: str) -> str | None:
    """The email a usable link would sign in, without using the link up."""
    if not token:
        return None
    return db.scalar(
        select(MagicLink.email).where(
            MagicLink.token_hash == hash_token(token),
            MagicLink.used_at.is_(None),
            MagicLink.expires_at > env.now(),
        )
    )


def consume_sign_in_link(db: Session, env: Env, token: str) -> User | None:
    if not token:
        return None
    now = env.now()
    link = _claim(db, hash_token(token), now)
    if link is None:
        return None
    return _user_for(db, link.email, now)


def consume_sign_in_code(db: Session, env: Env, request: str, raw_code: str) -> CodeCheck:
    """Sign in with the emailed code, from the window that asked for it.

    Each pending sign-in allows a few guesses before it is burned, and guesses
    per email are capped across sign-ins, so asking for fresh codes does not
    give an attacker more tries. The link and the code are one sign-in: using
    either spends both.
    """
    if not request:
        return CodeCheck()
    now = env.now()
    link = db.get(MagicLink, request)
    if (
        link is None
        or link.code_hash is None
        or link.used_at is not None
        or link.expires_at <= now
        or link.code_attempts >= SIGN_IN_CODE_ATTEMPTS
    ):
        return CodeCheck()
    email = link.email
    code = _CODE_SEPARATORS.sub("", raw_code)
    if not _CODE_SHAPE.fullmatch(code):
        return CodeCheck(retry_email=email)
    if not env.limiter.allow(f"sign-in-code:email:{email}", SIGN_IN_CODE_GUESSES_PER_EMAIL):
        raise RateLimited(TOO_MANY_ATTEMPTS)
    counted = db.execute(
        update(MagicLink)
        .where(
            MagicLink.token_hash == request,
            MagicLink.used_at.is_(None),
            MagicLink.code_attempts < SIGN_IN_CODE_ATTEMPTS,
        )
        .values(code_attempts=MagicLink.code_attempts + 1)
    )
    if rows_affected(counted) != 1:
        db.rollback()
        return CodeCheck()
    db.commit()
    db.refresh(link)
    if constant_time_equals(link.code_hash or "", _code_hash(env, request, code)):
        claimed = _claim(db, request, now)
        if claimed is None:
            return CodeCheck()
        return CodeCheck(user=_user_for(db, claimed.email, now))
    if link.code_attempts >= SIGN_IN_CODE_ATTEMPTS:
        db.execute(
            update(MagicLink)
            .where(MagicLink.token_hash == request, MagicLink.used_at.is_(None))
            .values(used_at=now)
        )
        db.commit()
        return CodeCheck()
    return CodeCheck(retry_email=email)


def join_waitlist(db: Session, env: Env, raw_email: str, client_ip: str) -> str:
    if not env.limiter.allow(f"waitlist:ip:{client_ip}", WAITLIST_PER_IP):
        raise RateLimited(TOO_MANY_ATTEMPTS)
    email = normalize_email(raw_email)
    try:
        db.add(Waitlist(email=email, created_at=env.now()))
        db.commit()
    except IntegrityError:
        # Already on the list, perhaps from a double click.
        db.rollback()
    return email
