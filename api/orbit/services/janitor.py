from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, exists, or_
from sqlalchemy.orm import Session

from orbit import models
from orbit.services import email_allowance
from orbit.services.context import Env

UNUSED_CLIENT_RETENTION = timedelta(days=90)
UNUSED_METADATA_CLIENT_RETENTION = timedelta(days=1)
SPENT_RETENTION = timedelta(days=1)
REVOKED_TOKEN_RETENTION = timedelta(days=7)
# Stripe stops retrying an event after three days; long past that, its record guards nothing.
STRIPE_EVENT_RETENTION = timedelta(days=90)


def run_cleanup(db: Session, env: Env) -> None:
    now = env.now()
    db.execute(delete(models.MagicLink).where(models.MagicLink.expires_at < now - SPENT_RETENTION))
    db.execute(delete(models.WebSession).where(models.WebSession.expires_at < now))
    db.execute(delete(models.OAuthCode).where(models.OAuthCode.expires_at < now - SPENT_RETENTION))
    token_cutoff = now - REVOKED_TOKEN_RETENTION
    db.execute(
        delete(models.OAuthToken).where(
            or_(
                models.OAuthToken.refresh_expires_at < token_cutoff,
                models.OAuthToken.revoked_at < token_cutoff,
            )
        )
    )
    for registration_type, retention in (
        ("dcr", UNUSED_CLIENT_RETENTION),
        ("cimd", UNUSED_METADATA_CLIENT_RETENTION),
    ):
        db.execute(
            delete(models.OAuthClient).where(
                models.OAuthClient.registration_type == registration_type,
                models.OAuthClient.created_at < now - retention,
                ~exists().where(models.OAuthToken.client_id == models.OAuthClient.client_id),
                ~exists().where(models.OAuthCode.client_id == models.OAuthClient.client_id),
            )
        )
    email_allowance.prune(db, now)
    db.execute(
        delete(models.StripeEvent).where(
            models.StripeEvent.received_at < now - STRIPE_EVENT_RETENTION
        )
    )
    db.commit()
    env.limiter.prune()
