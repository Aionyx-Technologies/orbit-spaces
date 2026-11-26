from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from orbit.models import (
    AiUseEntry,
    BillingAccount,
    CreditGrant,
    EmailSend,
    StripeEvent,
    User,
)
from tests.conftest import Factory, Person

NOW = datetime(2026, 1, 1, 12, tzinfo=UTC)


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com")


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def grant(user_id: str, event_id: str) -> CreditGrant:
    return CreditGrant(
        user_id=user_id,
        kind="ai",
        amount=100,
        expires_at=NOW + timedelta(days=365),
        stripe_event_id=event_id,
        created_at=NOW,
    )


def test_deleting_a_user_removes_billing_rows(db: Session, alex: Person) -> None:
    credit = grant(alex.id, "evt_1")
    db.add_all(
        [
            BillingAccount(user_id=alex.id, stripe_customer_id="cus_1", updated_at=NOW),
            credit,
            EmailSend(user_id=alex.id, sent_at=NOW),
        ]
    )
    db.flush()
    db.add(
        AiUseEntry(
            user_id=alex.id,
            kind="combine",
            delta=1,
            period_start=NOW,
            created_at=NOW,
            grant_id=credit.id,
        )
    )
    db.commit()

    db.delete(db.get(User, alex.id))
    db.commit()

    for model in (BillingAccount, CreditGrant, EmailSend, AiUseEntry):
        assert count(db, model) == 0


def test_a_stripe_event_id_is_unique(db: Session, alex: Person) -> None:
    db.add(StripeEvent(id="evt_1", type="invoice.paid", received_at=NOW))
    db.commit()
    db.add(StripeEvent(id="evt_1", type="invoice.paid", received_at=NOW))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(grant(alex.id, "evt_2"))
    db.commit()
    db.add(grant(alex.id, "evt_2"))
    with pytest.raises(IntegrityError):
        db.commit()
