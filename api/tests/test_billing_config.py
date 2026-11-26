from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import pytest

from orbit import billing
from orbit.billing import BillingSignatureError, Product, StripeGateway
from orbit.config import Settings
from orbit.main import Overrides, create_app
from orbit.runtime import Runtime
from tests.billing_helpers import FakeBilling, signed_event
from tests.conftest import SECRET_KEY

STRIPE_FIELDS = {
    "stripe_secret_key": "sk_test_x",
    "stripe_webhook_secret": "whsec_x",
    "stripe_price_plus_monthly": "price_pm",
    "stripe_price_plus_yearly": "price_py",
    "stripe_price_ai_pack": "price_ai",
    "stripe_price_email_pack": "price_em",
}


def make_settings(**overrides: Any) -> Settings:
    return Settings(_env_file=None, secret_key=SECRET_KEY, **overrides)


def test_billing_is_off_unless_every_stripe_setting_is_set() -> None:
    assert make_settings().billing_enabled is False
    assert make_settings(**STRIPE_FIELDS).billing_enabled is True
    for name in STRIPE_FIELDS:
        partial = {key: value for key, value in STRIPE_FIELDS.items() if key != name}
        assert make_settings(**partial).billing_enabled is False, name


def test_a_server_without_stripe_has_no_gateway(runtime: Runtime) -> None:
    assert runtime.env.billing is None


def test_a_server_with_stripe_builds_the_gateway(database_url: str) -> None:
    settings = make_settings(database_url=database_url, **STRIPE_FIELDS)
    app = create_app(settings)
    assert isinstance(app.state.runtime.env.billing, StripeGateway)


def test_an_override_replaces_the_gateway(database_url: str) -> None:
    fake = FakeBilling()
    app = create_app(make_settings(database_url=database_url), overrides=Overrides(billing=fake))
    assert app.state.runtime.env.billing is fake


class StubStripe:
    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.sessions: list[dict[str, Any]] = []
        self.customers: list[dict[str, Any]] = []
        self.portals: list[dict[str, Any]] = []
        self.cancelled: list[str] = []
        self.deleted: list[str] = []
        monkeypatch.setattr(billing.stripe.checkout.Session, "create", self._session)
        monkeypatch.setattr(billing.stripe.Customer, "create", self._customer)
        monkeypatch.setattr(billing.stripe.billing_portal.Session, "create", self._portal)
        monkeypatch.setattr(billing.stripe.Subscription, "list", self._subscriptions)
        monkeypatch.setattr(billing.stripe.Subscription, "cancel", self._cancel)
        monkeypatch.setattr(billing.stripe.Customer, "delete", self._delete)

    def _session(self, **kwargs: Any) -> dict[str, Any]:
        self.sessions.append(kwargs)
        return {"url": "https://checkout.stripe.test/s"}

    def _customer(self, **kwargs: Any) -> dict[str, Any]:
        self.customers.append(kwargs)
        return {"id": "cus_new"}

    def _portal(self, **kwargs: Any) -> dict[str, Any]:
        self.portals.append(kwargs)
        return {"url": "https://portal.stripe.test/p"}

    def _subscriptions(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "data": [
                {"id": "sub_1", "status": "active"},
                {"id": "sub_2", "status": "trialing"},
                {"id": "sub_3", "status": "canceled"},
            ]
        }

    def _cancel(self, subscription_id: str, **kwargs: Any) -> dict[str, Any]:
        self.cancelled.append(subscription_id)
        return {}

    def _delete(self, customer_id: str, **kwargs: Any) -> dict[str, Any]:
        self.deleted.append(customer_id)
        return {}


@pytest.fixture
def stripe_stub(monkeypatch: pytest.MonkeyPatch) -> StubStripe:
    return StubStripe(monkeypatch)


def gateway() -> StripeGateway:
    return StripeGateway(make_settings(**STRIPE_FIELDS))


def checkout(product: Product, customer_id: str | None = None) -> billing.CheckoutLink:
    return gateway().create_checkout(
        user_id="user-1",
        email="a@example.com",
        product=product,
        customer_id=customer_id,
        success_url="https://orbit.test/ok",
        cancel_url="https://orbit.test/no",
    )


def test_checkout_metadata_carries_the_user_and_product(stripe_stub: StubStripe) -> None:
    link = checkout(Product.PLUS_YEARLY)
    session = stripe_stub.sessions[0]
    assert session["mode"] == "subscription"
    assert session["client_reference_id"] == "user-1"
    assert session["metadata"] == {"user_id": "user-1", "product": "plus_yearly"}
    assert session["subscription_data"]["metadata"] == {
        "user_id": "user-1",
        "product": "plus_yearly",
    }
    assert session["line_items"] == [{"price": "price_py", "quantity": 1}]
    assert session["success_url"] == "https://orbit.test/ok"
    assert session["cancel_url"] == "https://orbit.test/no"
    assert session["customer"] == "cus_new"
    assert link.url == "https://checkout.stripe.test/s"
    assert link.customer_id == "cus_new"
    assert stripe_stub.customers == [
        {
            "email": "a@example.com",
            "metadata": {"user_id": "user-1"},
            "idempotency_key": "orbit-customer-user-1",
            "api_key": "sk_test_x",
        }
    ]


def test_checkout_accepts_cards_only_in_both_modes(stripe_stub: StubStripe) -> None:
    checkout(Product.PLUS_YEARLY)
    checkout(Product.AI_PACK)
    assert [s["payment_method_types"] for s in stripe_stub.sessions] == [["card"], ["card"]]


def test_a_pack_is_a_one_off_payment_on_the_existing_customer(stripe_stub: StubStripe) -> None:
    link = checkout(Product.AI_PACK, customer_id="cus_old")
    session = stripe_stub.sessions[0]
    assert session["mode"] == "payment"
    assert session["customer"] == "cus_old"
    assert session["metadata"] == {"user_id": "user-1", "product": "ai_pack"}
    assert "subscription_data" not in session
    assert session["line_items"] == [{"price": "price_ai", "quantity": 1}]
    assert link.customer_id == "cus_old"
    assert stripe_stub.customers == []


def test_each_product_uses_its_own_price(stripe_stub: StubStripe) -> None:
    for product in Product:
        checkout(product, customer_id="cus_old")
    prices = [s["line_items"][0]["price"] for s in stripe_stub.sessions]
    assert prices == ["price_pm", "price_py", "price_ai", "price_em"]


def test_portal_and_cancel(stripe_stub: StubStripe) -> None:
    url = gateway().create_portal(customer_id="cus_1", return_url="https://orbit.test/s")
    assert url == "https://portal.stripe.test/p"
    assert stripe_stub.portals[0]["customer"] == "cus_1"
    gateway().cancel_customer("cus_1")
    assert stripe_stub.cancelled == ["sub_1", "sub_2"]
    assert stripe_stub.deleted == ["cus_1"]


def stripe_signature(payload: bytes, age_seconds: int = 0) -> str:
    stamp = int(time.time()) - age_seconds
    digest = hmac.new(b"whsec_x", f"{stamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={stamp},v1={digest}"


def test_verify_event_accepts_a_signed_payload() -> None:
    payload = json.dumps({"id": "evt_1", "type": "x"}).encode()
    event = gateway().verify_event(payload, stripe_signature(payload))
    assert event["id"] == "evt_1"


@pytest.mark.parametrize("signature", ["", "garbage", "t=1,v1=00"])
def test_verify_event_rejects_a_bad_signature(signature: str) -> None:
    with pytest.raises(BillingSignatureError):
        gateway().verify_event(b'{"id": "evt_1"}', signature)


def test_verify_event_rejects_an_old_but_otherwise_valid_signature() -> None:
    payload = json.dumps({"id": "evt_1", "type": "x"}).encode()
    with pytest.raises(BillingSignatureError):
        gateway().verify_event(payload, stripe_signature(payload, age_seconds=3600))


def test_verify_event_accepts_a_recent_valid_signature() -> None:
    payload = json.dumps({"id": "evt_1", "type": "x"}).encode()
    assert gateway().verify_event(payload, stripe_signature(payload, age_seconds=60))["id"]


def invalid_request(code: str) -> billing.stripe.InvalidRequestError:
    return billing.stripe.InvalidRequestError("stripe said no", "customer", code=code)


def test_cancel_customer_treats_a_missing_customer_as_done(
    monkeypatch: pytest.MonkeyPatch, stripe_stub: StubStripe
) -> None:
    def gone(*args: Any, **kwargs: Any) -> Any:
        raise invalid_request("resource_missing")

    monkeypatch.setattr(billing.stripe.Customer, "delete", gone)
    gateway().cancel_customer("cus_gone")
    assert stripe_stub.cancelled == ["sub_1", "sub_2"]

    monkeypatch.setattr(billing.stripe.Subscription, "list", gone)
    gateway().cancel_customer("cus_gone")


def test_cancel_customer_still_raises_other_stripe_errors(
    monkeypatch: pytest.MonkeyPatch, stripe_stub: StubStripe
) -> None:
    def refused(*args: Any, **kwargs: Any) -> Any:
        raise invalid_request("parameter_invalid")

    monkeypatch.setattr(billing.stripe.Customer, "delete", refused)
    with pytest.raises(billing.stripe.InvalidRequestError):
        gateway().cancel_customer("cus_1")


def test_verify_event_rejects_a_malformed_payload() -> None:
    payload = b"not json"
    with pytest.raises(BillingSignatureError):
        gateway().verify_event(payload, stripe_signature(payload))


def test_the_fake_accepts_only_what_it_signed() -> None:
    fake = FakeBilling()
    payload, signature = signed_event("checkout.session.completed", {"id": "cs_1"})
    assert fake.verify_event(payload, signature)["data"]["object"] == {"id": "cs_1"}
    with pytest.raises(BillingSignatureError):
        fake.verify_event(payload, "nope")


@pytest.mark.parametrize(
    "error",
    [
        billing.stripe.APIConnectionError("timed out for cus_1"),
        billing.stripe.RateLimitError("slow down cus_1"),
        billing.stripe.APIError("down for cus_1", http_status=502),
        billing.stripe.APIError("down for cus_1"),
    ],
)
def test_cancel_customer_reports_an_outage_as_transient(
    monkeypatch: pytest.MonkeyPatch, stripe_stub: StubStripe, error: Exception
) -> None:
    def failing(*args: Any, **kwargs: Any) -> Any:
        raise error

    monkeypatch.setattr(billing.stripe.Subscription, "cancel", failing)
    with pytest.raises(billing.BillingTransientError) as raised:
        gateway().cancel_customer("cus_1")
    assert "cus_1" not in str(raised.value)


def test_cancel_customer_raises_an_authentication_error_as_it_is(
    monkeypatch: pytest.MonkeyPatch, stripe_stub: StubStripe
) -> None:
    def failing(*args: Any, **kwargs: Any) -> Any:
        raise billing.stripe.AuthenticationError("bad key", http_status=401)

    monkeypatch.setattr(billing.stripe.Subscription, "list", failing)
    with pytest.raises(billing.stripe.AuthenticationError):
        gateway().cancel_customer("cus_1")
