from __future__ import annotations

import json
import logging
from dataclasses import replace
from datetime import timedelta

import pytest
import stripe
from sqlalchemy.orm import Session

from orbit import billing
from orbit.billing import BillingTransientError, StripeGateway
from orbit.config import Settings
from orbit.errors import BillingUnavailable
from orbit.models import AiUseEntry, BillingAccount, CreditGrant, User
from orbit.services import accounts as accounts_service
from orbit.services.account_export import export_account
from orbit.services.context import Env
from tests.billing_helpers import FakeBilling
from tests.conftest import SECRET_KEY, Factory, Person

CUSTOMER = "cus_secret_123"
SUBSCRIPTION = "sub_secret_456"
EVENT = "evt_secret_789"
INTENT = "pi_secret_012"


@pytest.fixture
def alex(make: Factory) -> Person:
    return make.user("alex@example.com", "Alex")


def load_user(db: Session, person: Person) -> User:
    user = db.get(User, person.id)
    assert user is not None
    return user


def add_billing(db: Session, env: Env, person: Person) -> None:
    now = env.now()
    db.add(
        BillingAccount(
            user_id=person.id,
            stripe_customer_id=CUSTOMER,
            plan="plus",
            status="active",
            period_start=now,
            period_end=now + timedelta(days=30),
            cancel_at_period_end=True,
            stripe_subscription_id=SUBSCRIPTION,
            updated_at=now,
        )
    )
    db.add(
        CreditGrant(
            user_id=person.id,
            kind="ai",
            amount=100,
            expires_at=now + timedelta(days=90),
            stripe_event_id=EVENT,
            stripe_payment_intent=INTENT,
            created_at=now,
        )
    )
    db.commit()


def with_billing(env: Env, billing: object) -> Env:
    return replace(env, billing=billing)  # type: ignore[arg-type]


def test_deleting_an_account_cancels_the_stripe_customer(
    db: Session, env: Env, alex: Person
) -> None:
    add_billing(db, env, alex)
    fake = FakeBilling()

    accounts_service.delete_account(db, with_billing(env, fake), load_user(db, alex))

    assert fake.cancelled_customers == [CUSTOMER]
    assert db.get(User, alex.id) is None
    assert db.get(BillingAccount, alex.id) is None


def test_an_unreachable_stripe_refuses_the_deletion_and_keeps_the_account(
    db: Session, env: Env, alex: Person, caplog: pytest.LogCaptureFixture
) -> None:
    attempts: list[str] = []

    class Unreachable(FakeBilling):
        def cancel_customer(self, customer_id: str) -> None:
            attempts.append(customer_id)
            raise BillingTransientError(f"boom for {customer_id}")

    add_billing(db, env, alex)

    with caplog.at_level(logging.WARNING), pytest.raises(BillingUnavailable) as raised:
        accounts_service.delete_account(db, with_billing(env, Unreachable()), load_user(db, alex))

    assert raised.value.code == "billing_unavailable"
    assert "Stripe" in str(raised.value)
    assert attempts == [CUSTOMER]
    assert not db.in_transaction()
    db.expire_all()
    assert db.get(User, alex.id) is not None
    assert db.get(BillingAccount, alex.id) is not None
    assert db.query(CreditGrant).count() == 1
    assert CUSTOMER not in caplog.text
    assert "boom" not in caplog.text


@pytest.mark.parametrize(
    "error",
    [
        stripe.AuthenticationError("bad key for cus_secret_123"),
        stripe.PermissionError("no access to cus_secret_123"),
        stripe.InvalidRequestError("boom cus_secret_123", "customer", code="parameter_invalid"),
    ],
)
def test_a_non_transient_stripe_error_does_not_block_deletion(
    db: Session,
    env: Env,
    alex: Person,
    caplog: pytest.LogCaptureFixture,
    error: stripe.StripeError,
) -> None:
    class Refusing(FakeBilling):
        def cancel_customer(self, customer_id: str) -> None:
            raise error

    add_billing(db, env, alex)

    with caplog.at_level(logging.WARNING):
        accounts_service.delete_account(db, with_billing(env, Refusing()), load_user(db, alex))

    assert db.get(User, alex.id) is None
    assert db.get(BillingAccount, alex.id) is None
    assert type(error).__name__ in caplog.text
    assert CUSTOMER not in caplog.text
    assert "boom" not in caplog.text


def _stripe_gateway(monkeypatch: pytest.MonkeyPatch, failure: Exception) -> StripeGateway:
    def fail(*args: object, **kwargs: object) -> object:
        raise failure

    monkeypatch.setattr(billing.stripe.Subscription, "list", fail)
    return StripeGateway(
        Settings(
            _env_file=None,
            secret_key=SECRET_KEY,
            stripe_secret_key="sk_test_x",
            stripe_webhook_secret="whsec_x",
            stripe_price_plus_monthly="price_pm",
            stripe_price_plus_yearly="price_py",
            stripe_price_ai_pack="price_ai",
            stripe_price_email_pack="price_em",
        )
    )


def test_a_customer_stripe_no_longer_has_does_not_block_deletion(
    db: Session, env: Env, alex: Person, monkeypatch: pytest.MonkeyPatch
) -> None:
    gone = stripe.InvalidRequestError("No such customer", "customer", code="resource_missing")
    add_billing(db, env, alex)

    accounts_service.delete_account(
        db, with_billing(env, _stripe_gateway(monkeypatch, gone)), load_user(db, alex)
    )

    assert db.get(User, alex.id) is None


@pytest.mark.parametrize(
    "error",
    [
        stripe.APIConnectionError("timed out"),
        stripe.RateLimitError("slow down"),
        stripe.APIError("stripe is down", http_status=503),
    ],
)
def test_the_stripe_gateway_reports_an_outage_as_transient(
    db: Session, env: Env, alex: Person, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    add_billing(db, env, alex)

    with pytest.raises(BillingUnavailable):
        accounts_service.delete_account(
            db, with_billing(env, _stripe_gateway(monkeypatch, error)), load_user(db, alex)
        )

    db.expire_all()
    assert db.get(User, alex.id) is not None


def test_no_database_transaction_is_open_during_the_stripe_cancel(
    db: Session, env: Env, alex: Person
) -> None:
    seen: list[bool] = []

    class Watching(FakeBilling):
        def cancel_customer(self, customer_id: str) -> None:
            seen.append(db.in_transaction())

    add_billing(db, env, alex)

    accounts_service.delete_account(db, with_billing(env, Watching()), load_user(db, alex))

    assert seen == [False]
    assert db.get(User, alex.id) is None


def test_an_account_without_billing_is_deleted_as_before_and_calls_nothing(
    db: Session, env: Env, alex: Person, make: Factory
) -> None:
    fake = FakeBilling()
    blake = make.user("blake@example.com")
    add_billing(db, env, blake)

    accounts_service.delete_account(db, with_billing(env, fake), load_user(db, alex))
    assert fake.cancelled_customers == []
    assert db.get(User, alex.id) is None

    # Billing off: a person with a billing account is still deleted and nothing is called.
    accounts_service.delete_account(db, env, load_user(db, blake))
    assert fake.cancelled_customers == []
    assert db.get(User, blake.id) is None


def test_the_export_includes_plan_and_grants_but_not_stripe_ids(
    db: Session, env: Env, alex: Person
) -> None:
    add_billing(db, env, alex)
    grant = db.query(CreditGrant).one()
    db.add(
        AiUseEntry(
            user_id=alex.id,
            kind="combine",
            delta=7,
            period_start=env.now(),
            grant_id=grant.id,
            created_at=env.now(),
        )
    )
    db.commit()

    document = export_account(db, env, load_user(db, alex))
    text = json.dumps(document)

    billing = document["billing"]
    assert billing["plan"] == "plus"
    assert billing["status"] == "active"
    assert billing["cancel_at_period_end"] is True
    assert billing["period_start"]
    assert billing["period_end"]
    [exported] = billing["credit_grants"]
    assert exported["kind"] == "ai"
    assert exported["amount"] == 100
    assert exported["remaining"] == 93
    assert exported["revoked"] is False
    assert exported["expires_at"]
    assert exported["created_at"]
    for secret in (CUSTOMER, SUBSCRIPTION, EVENT, INTENT):
        assert secret not in text


def test_the_export_has_no_billing_key_without_billing(db: Session, env: Env, alex: Person) -> None:
    assert "billing" not in export_account(db, env, load_user(db, alex))
