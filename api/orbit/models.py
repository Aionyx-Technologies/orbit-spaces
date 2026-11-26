from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    LargeBinary,
    MetaData,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from orbit.limits import (
    ABOUT_MAX,
    BROWSER_NAME_MAX,
    DISPLAY_NAME_MAX,
    EMAIL_FREQUENCY_MAX,
    MEMORY_KEY_MAX,
    SPACE_NAME_MAX,
    TEMPLATE_ID_MAX,
    TIME_ZONE_MAX,
    TITLE_MAX,
)
from orbit.space_templates import GENERAL_ID, general_template_json

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def new_id() -> str:
    return str(uuid.uuid4())


class UTCDateTime(sa.types.TypeDecorator[datetime]):
    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: sa.Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; use timezone-aware UTC values.")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: sa.Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: UTCDateTime}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(DISPLAY_NAME_MAX))
    created_at: Mapped[datetime]
    about: Mapped[str] = mapped_column(String(ABOUT_MAX), default="", server_default="")
    time_zone: Mapped[str] = mapped_column(
        String(TIME_ZONE_MAX), default="UTC", server_default="UTC"
    )
    email_frequency: Mapped[str] = mapped_column(
        String(EMAIL_FREQUENCY_MAX), default="instant", server_default="instant"
    )
    default_space_id: Mapped[str | None] = mapped_column(String(36))
    avatar_updated_at: Mapped[datetime | None]


class UserAvatar(Base):
    __tablename__ = "user_avatars"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime]


class AiUseEntry(Base):
    """One line in a person's AI use ledger: a use (delta 1) or the refund of one (delta -1)."""

    __tablename__ = "ai_use_ledger"
    __table_args__ = (Index("ix_ai_use_ledger_user_period", "user_id", "period_start"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    delta: Mapped[int] = mapped_column(sa.Integer)
    # The start of the monthly period the use counts against; a refund copies its use's.
    period_start: Mapped[datetime]
    # Set on a refund: the use it gives back. Unique, so one use is refunded at most once.
    refunds_id: Mapped[str | None] = mapped_column(
        ForeignKey("ai_use_ledger.id", ondelete="CASCADE"), unique=True
    )
    created_at: Mapped[datetime]
    # Set when the use was paid for from a credit grant instead of the monthly allowance.
    grant_id: Mapped[str | None] = mapped_column(ForeignKey("credit_grants.id"))


class BillingAccount(Base):
    """A person's Stripe customer and the plan their subscription gives them."""

    __tablename__ = "billing_accounts"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    stripe_customer_id: Mapped[str] = mapped_column(String(64), unique=True)
    plan: Mapped[str] = mapped_column(String(16), default="free", server_default="free")
    status: Mapped[str] = mapped_column(String(32), default="", server_default="")
    period_start: Mapped[datetime | None]
    period_end: Mapped[datetime | None]
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa.false()
    )
    # The subscription that currently gives the plan, and the time of the newest Stripe event
    # applied to it, so an older event delivered late changes nothing.
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64))
    last_event_at: Mapped[datetime | None]
    updated_at: Mapped[datetime]


class CreditGrant(Base):
    """Bought credits: a number of AI uses or instant emails that expire."""

    __tablename__ = "credit_grants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # "ai" or "email".
    kind: Mapped[str] = mapped_column(String(8))
    amount: Mapped[int] = mapped_column(sa.Integer)
    expires_at: Mapped[datetime]
    # The Stripe event that created the grant; unique, so a replayed event grants once.
    stripe_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    stripe_payment_intent: Mapped[str | None] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]


class StripeEvent(Base):
    """A Stripe webhook event already handled, so a redelivery is ignored."""

    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime]


class EmailSend(Base):
    """One instant email sent for a person, counted against their daily limit."""

    __tablename__ = "email_send_log"
    __table_args__ = (Index("ix_email_send_log_user_sent", "user_id", "sent_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    sent_at: Mapped[datetime]
    # Set when the send was paid for from a credit grant.
    grant_id: Mapped[str | None] = mapped_column(ForeignKey("credit_grants.id"))


class MagicLink(Base):
    __tablename__ = "magic_links"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    code_attempts: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")


class WebSession(Base):
    __tablename__ = "web_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime]
    user_agent: Mapped[str] = mapped_column(String(BROWSER_NAME_MAX), default="", server_default="")


class OAuthClient(Base):
    __tablename__ = "oauth_clients"
    __table_args__ = (
        CheckConstraint("registration_type in ('cimd', 'dcr')", name="registration_type"),
    )

    client_id: Mapped[str] = mapped_column(String(512), primary_key=True)
    client_name: Mapped[str] = mapped_column(String(200))
    redirect_uris: Mapped[list[str]] = mapped_column(JSON)
    registration_type: Mapped[str] = mapped_column(String(10))
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime]


class OAuthCode(Base):
    __tablename__ = "oauth_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    redirect_uri: Mapped[str] = mapped_column(Text)
    code_challenge: Mapped[str] = mapped_column(String(128))
    resource: Mapped[str | None] = mapped_column(Text)
    scopes: Mapped[list[str]] = mapped_column(JSON)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class OAuthToken(Base):
    __tablename__ = "oauth_tokens"

    access_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scopes: Mapped[list[str]] = mapped_column(JSON)
    resource: Mapped[str | None] = mapped_column(Text)
    access_expires_at: Mapped[datetime]
    refresh_expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime]


class Space(Base):
    __tablename__ = "spaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(SPACE_NAME_MAX))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime]
    deleted_at: Mapped[datetime | None]
    template_id: Mapped[str] = mapped_column(
        String(TEMPLATE_ID_MAX), default=GENERAL_ID, server_default=GENERAL_ID
    )
    template: Mapped[dict[str, Any]] = mapped_column(JSON, default=general_template_json)


class SpaceMember(Base):
    __tablename__ = "space_members"

    space_id: Mapped[str] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    joined_at: Mapped[datetime]
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa.true())
    last_read_at: Mapped[datetime | None]


class Invite(Base):
    __tablename__ = "invites"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), index=True)
    invited_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    email: Mapped[str | None] = mapped_column(String(320))
    expires_at: Mapped[datetime]
    accepted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    accepted_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        CheckConstraint("kind in ('note', 'plan')", name="kind"),
        CheckConstraint("author_kind in ('person', 'assistant', 'orbit')", name="author_kind"),
        Index("ix_items_space_created", "space_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(TITLE_MAX))
    content: Mapped[str] = mapped_column(Text)
    author_kind: Mapped[str] = mapped_column(String(10))
    shared_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    via: Mapped[str] = mapped_column(String(100))
    source_item_ids: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True))
    created_at: Mapped[datetime]
    retracted_at: Mapped[datetime | None]


class Memory(Base):
    __tablename__ = "memory"
    __table_args__ = (Index("ix_memory_space_fact", "space_id", "fact_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    space_id: Mapped[str] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(MEMORY_KEY_MAX))
    value: Mapped[str] = mapped_column(Text)
    set_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    via: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime]
    superseded_at: Mapped[datetime | None]
    # Stable across every version of a fact, renames included.
    fact_id: Mapped[str] = mapped_column(String(36))
    # One of the FACT_* actions in orbit.services.memory.
    action: Mapped[str] = mapped_column(String(16))
    previous_key: Mapped[str | None] = mapped_column(String(MEMORY_KEY_MAX))


Index(
    "uq_memory_current_key",
    Memory.space_id,
    sa.func.lower(Memory.key),
    unique=True,
    sqlite_where=Memory.superseded_at.is_(None),
    postgresql_where=Memory.superseded_at.is_(None),
)


class Waitlist(Base):
    __tablename__ = "waitlist"

    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    created_at: Mapped[datetime]
