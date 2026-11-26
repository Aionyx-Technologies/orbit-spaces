from __future__ import annotations

from typing import Any

import pytest
import stripe
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from orbit.billing import BillingTransientError, CheckoutLink, Product
from orbit.config import Settings
from orbit.db import session_scope
from orbit.main import Overrides, create_app
from orbit.models import BillingAccount, User
from orbit.runtime import Runtime
from tests.billing_helpers import FakeBilling, signed_event
from tests.conftest import FakeClock, FakeFetcher, RecordingSender
from tests.rest_helpers import People

ALEX = "alex@example.com"


@pytest.fixture
def fake_billing() -> FakeBilling:
    return FakeBilling()


@pytest.fixture
def app(
    settings: Settings,
    clock: FakeClock,
    sender: RecordingSender,
    fetcher: FakeFetcher,
    fake_billing: FakeBilling,
) -> FastAPI:
    return create_app(
        settings,
        overrides=Overrides(clock=clock, sender=sender, fetcher=fetcher, billing=fake_billing),
    )


@pytest.fixture
def people(client: TestClient, runtime: Runtime, sender: RecordingSender) -> People:
    return People(client, runtime, sender)


def _user_id(runtime: Runtime, email: str) -> str:
    with session_scope(runtime.session_factory) as db:
        return db.scalars(select(User.id).where(User.email == email)).one()


def _account(runtime: Runtime, user_id: str) -> BillingAccount | None:
    with session_scope(runtime.session_factory) as db:
        account = db.get(BillingAccount, user_id)
        if account is not None:
            db.expunge(account)
        return account


def _make_plus(runtime: Runtime, user_id: str, customer: str = "cus_plus") -> None:
    with session_scope(runtime.session_factory) as db:
        db.add(
            BillingAccount(
                user_id=user_id,
                stripe_customer_id=customer,
                plan="plus",
                status="active",
                cancel_at_period_end=False,
                updated_at=runtime.env.now(),
            )
        )
        db.commit()


def _subscription_event(customer: str, user_id: str) -> tuple[bytes, str]:
    return signed_event(
        "customer.subscription.created",
        {
            "id": "sub_1",
            "customer": customer,
            "status": "active",
            "metadata": {"user_id": user_id},
        },
    )


def test_checkout_returns_the_gateway_url_and_remembers_the_customer(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)
    user_id = _user_id(runtime, ALEX)

    response = client.post("/api/billing/checkout", json={"product": "plus_monthly"})

    assert response.status_code == 200, response.text
    assert response.json() == {"url": "https://checkout.test/plus_monthly"}
    call = fake_billing.checkouts[0]
    assert call["user_id"] == user_id
    assert call["email"] == ALEX
    assert call["product"] is Product.PLUS_MONTHLY
    assert call["customer_id"] is None
    base = runtime.settings.base_url
    assert call["success_url"] == f"{base}/settings?billing=success"
    assert call["cancel_url"] == f"{base}/settings?billing=cancelled"
    account = _account(runtime, user_id)
    assert account is not None
    assert account.stripe_customer_id == "cus_fake"
    assert account.plan == "free"


def test_a_second_checkout_reuses_the_stored_customer(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)
    client.post("/api/billing/checkout", json={"product": "ai_pack"})

    client.post("/api/billing/checkout", json={"product": "plus_monthly"})

    assert fake_billing.checkouts[1]["customer_id"] == "cus_fake"


def test_checkout_for_plus_when_already_plus_is_refused(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)
    _make_plus(runtime, _user_id(runtime, ALEX))

    response = client.post("/api/billing/checkout", json={"product": "plus_yearly"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_subscribed"
    assert fake_billing.checkouts == []


def test_a_pack_can_be_bought_while_on_plus(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)
    _make_plus(runtime, _user_id(runtime, ALEX))

    response = client.post("/api/billing/checkout", json={"product": "ai_pack"})

    assert response.status_code == 200
    assert fake_billing.checkouts[0]["customer_id"] == "cus_plus"


def test_an_unknown_product_is_invalid(people: People) -> None:
    response = people.as_(ALEX).post("/api/billing/checkout", json={"product": "gold"})

    assert response.status_code == 422


def test_portal_needs_a_billing_account(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)

    refused = client.post("/api/billing/portal")

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "no_billing_account"
    _make_plus(runtime, _user_id(runtime, ALEX))
    opened = client.post("/api/billing/portal")
    assert opened.status_code == 200
    assert opened.json() == {"url": "https://portal.test/cus_plus"}
    assert fake_billing.portals[0]["return_url"] == f"{runtime.settings.base_url}/settings"


def test_billing_state_for_a_person_without_an_account(people: People) -> None:
    body = people.as_(ALEX).get("/api/billing").json()

    assert body == {
        "plan": "free",
        "status": "",
        "period_end": None,
        "cancel_at_period_end": False,
        "ai_pack_credits": 0,
        "email_pack_credits": 0,
        "can_manage": False,
        "ai_pack_available": True,
        "email_pack_available": False,
    }


def test_a_validly_signed_webhook_changes_the_plan(
    people: People, runtime: Runtime, client: TestClient
) -> None:
    alex = people.as_(ALEX)
    user_id = _user_id(runtime, ALEX)
    alex.post("/api/billing/checkout", json={"product": "plus_monthly"})
    payload, signature = _subscription_event("cus_fake", user_id)

    response = client.post(
        "/api/billing/webhook", content=payload, headers={"Stripe-Signature": signature}
    )

    assert response.status_code == 200
    assert response.json() == {"received": True}
    account = _account(runtime, user_id)
    assert account is not None
    assert account.plan == "plus"
    assert people.as_(ALEX).get("/api/me").json()["plan"] == "plus"
    assert people.as_(ALEX).get("/api/billing").json()["can_manage"] is True


def test_a_webhook_with_a_bad_signature_is_rejected_and_changes_nothing(
    people: People, runtime: Runtime, client: TestClient
) -> None:
    people.as_(ALEX).post("/api/billing/checkout", json={"product": "plus_monthly"})
    user_id = _user_id(runtime, ALEX)
    payload, _ = _subscription_event("cus_fake", user_id)

    response = client.post(
        "/api/billing/webhook", content=payload, headers={"Stripe-Signature": "fake-v1=wrong"}
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_signature"
    account = _account(runtime, user_id)
    assert account is not None
    assert account.plan == "free"


def test_a_webhook_without_a_signature_header_is_rejected(
    client: TestClient, runtime: Runtime
) -> None:
    payload, _ = signed_event("charge.refunded", {})

    response = client.post("/api/billing/webhook", content=payload)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_signature"


def test_the_webhook_needs_no_origin_header(app: FastAPI) -> None:
    payload, signature = signed_event("invoice.payment_failed", {})

    with TestClient(app, base_url="https://orbit.test") as bare:
        response = bare.post(
            "/api/billing/webhook", content=payload, headers={"Stripe-Signature": signature}
        )
        refused = bare.post("/api/billing/portal")

    assert "origin" not in {name.lower() for name in response.request.headers}
    assert response.status_code == 200
    assert refused.status_code == 403


def test_the_webhook_response_does_not_depend_on_whether_the_event_changed_anything(
    client: TestClient,
) -> None:
    payload, signature = signed_event("something.unknown", {})
    headers = {"Stripe-Signature": signature}

    first = client.post("/api/billing/webhook", content=payload, headers=headers)
    repeat = client.post("/api/billing/webhook", content=payload, headers=headers)

    assert first.status_code == repeat.status_code == 200
    assert first.json() == repeat.json() == {"received": True}


def test_a_signed_out_person_cannot_check_out(people: People, fake_billing: FakeBilling) -> None:
    response = people.anonymous().post("/api/billing/checkout", json={"product": "ai_pack"})

    assert response.status_code == 401
    assert fake_billing.checkouts == []


def test_a_stripe_error_in_checkout_is_a_generic_503(
    people: People, fake_billing: FakeBilling, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(**_: Any) -> CheckoutLink:
        raise stripe.APIConnectionError("secret detail sk_live_abc")

    monkeypatch.setattr(fake_billing, "create_checkout", boom)

    response = people.as_(ALEX).post("/api/billing/checkout", json={"product": "ai_pack"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "billing_unavailable"
    assert "sk_live" not in response.text


def test_public_reports_whether_billing_is_on(client: TestClient) -> None:
    client.cookies.clear()

    assert client.get("/api/billing/public").json() == {"enabled": True}


def test_me_reports_the_plan_and_billing_enabled(people: People, runtime: Runtime) -> None:
    client = people.as_(ALEX)
    before = client.get("/api/me").json()
    _make_plus(runtime, _user_id(runtime, ALEX))
    after = client.get("/api/me").json()

    assert (before["plan"], before["billing_enabled"]) == ("free", True)
    assert after["plan"] == "plus"


def test_billing_routes_are_404_when_billing_is_off(
    settings: Settings, clock: FakeClock, sender: RecordingSender, fetcher: FakeFetcher
) -> None:
    app = create_app(settings, overrides=Overrides(clock=clock, sender=sender, fetcher=fetcher))
    with TestClient(
        app,
        base_url=settings.base_url,
        follow_redirects=False,
        headers={"Origin": settings.base_url},
    ) as c:
        runtime: Runtime = app.state.runtime
        assert runtime.env.billing is None
        people = People(c, runtime, sender)
        signed_in = people.as_(ALEX)
        assert signed_in.get("/api/billing").status_code == 404
        assert (
            signed_in.post("/api/billing/checkout", json={"product": "ai_pack"}).status_code == 404
        )
        assert signed_in.post("/api/billing/portal").status_code == 404
        payload, signature = signed_event("charge.refunded", {})
        hook = c.post(
            "/api/billing/webhook", content=payload, headers={"Stripe-Signature": signature}
        )
        assert hook.status_code == 404
        assert signed_in.get("/api/me").json()["billing_enabled"] is False
        c.cookies.clear()
        assert c.get("/api/billing/public").json() == {"enabled": False}


def test_no_database_transaction_is_open_during_the_stripe_calls(
    people: People, runtime: Runtime, fake_billing: FakeBilling, monkeypatch: pytest.MonkeyPatch
) -> None:
    open_during: list[bool] = []
    sessions: list[Any] = []
    real_checkout = fake_billing.create_checkout
    real_portal = fake_billing.create_portal

    def spy_checkout(**kwargs: Any) -> CheckoutLink:
        open_during.append(any(s.in_transaction() for s in sessions))
        return real_checkout(**kwargs)

    def spy_portal(**kwargs: Any) -> str:
        open_during.append(any(s.in_transaction() for s in sessions))
        return real_portal(**kwargs)

    monkeypatch.setattr(fake_billing, "create_checkout", spy_checkout)
    monkeypatch.setattr(fake_billing, "create_portal", spy_portal)
    original = runtime.session_factory.__call__

    class Spy:
        def __call__(self, *a: Any, **k: Any) -> Any:
            session = original(*a, **k)
            sessions.append(session)
            return session

    monkeypatch.setattr(runtime, "session_factory", Spy(), raising=False)
    client = people.as_(ALEX)
    assert client.post("/api/billing/checkout", json={"product": "ai_pack"}).status_code == 200
    assert client.post("/api/billing/portal").status_code == 200
    assert open_during == [False, False]


def test_a_twin_checkout_keeps_the_first_account(
    people: People, runtime: Runtime, fake_billing: FakeBilling, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = people.as_(ALEX)
    user_id = _user_id(runtime, ALEX)
    real_checkout = fake_billing.create_checkout

    def racing(**kwargs: Any) -> CheckoutLink:
        _make_plus(runtime, user_id, customer="cus_first")
        return real_checkout(**kwargs)

    monkeypatch.setattr(fake_billing, "create_checkout", racing)

    response = client.post("/api/billing/checkout", json={"product": "ai_pack"})

    assert response.status_code == 200
    assert response.json() == {"url": "https://checkout.test/ai_pack"}
    account = _account(runtime, user_id)
    assert account is not None
    assert account.stripe_customer_id == "cus_first"


def test_deleting_an_account_while_stripe_is_unreachable_is_refused(
    people: People, runtime: Runtime, fake_billing: FakeBilling, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = people.as_(ALEX)
    user_id = _user_id(runtime, ALEX)
    _make_plus(runtime, user_id)

    def unreachable(customer_id: str) -> None:
        raise BillingTransientError("APIConnectionError")

    monkeypatch.setattr(fake_billing, "cancel_customer", unreachable)

    response = client.delete("/api/me")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "billing_unavailable"
    assert _account(runtime, user_id) is not None
    monkeypatch.undo()
    assert client.delete("/api/me").status_code == 204
    assert fake_billing.cancelled_customers == ["cus_plus"]
    assert _account(runtime, user_id) is None


def _store_subscription(runtime: Runtime, user_id: str, status: str) -> None:
    with session_scope(runtime.session_factory) as db:
        db.add(
            BillingAccount(
                user_id=user_id,
                stripe_customer_id="cus_sub",
                plan="free",
                status=status,
                stripe_subscription_id="sub_open",
                cancel_at_period_end=False,
                updated_at=runtime.env.now(),
            )
        )
        db.commit()


@pytest.mark.parametrize("status", ["incomplete", "unpaid", "paused"])
def test_a_new_plus_checkout_is_refused_while_a_subscription_is_still_open(
    people: People, runtime: Runtime, fake_billing: FakeBilling, status: str
) -> None:
    client = people.as_(ALEX)
    _store_subscription(runtime, _user_id(runtime, ALEX), status)

    refused = client.post("/api/billing/checkout", json={"product": "plus_monthly"})

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "already_subscribed"
    assert fake_billing.checkouts == []
    pack = client.post("/api/billing/checkout", json={"product": "ai_pack"})
    assert pack.status_code == 200


@pytest.mark.parametrize("status", ["canceled", "incomplete_expired"])
def test_a_new_plus_checkout_is_allowed_after_the_subscription_ended(
    people: People, runtime: Runtime, fake_billing: FakeBilling, status: str
) -> None:
    client = people.as_(ALEX)
    _store_subscription(runtime, _user_id(runtime, ALEX), status)

    response = client.post("/api/billing/checkout", json={"product": "plus_yearly"})

    assert response.status_code == 200
    assert fake_billing.checkouts[0]["customer_id"] == "cus_sub"


def test_a_twin_checkout_paid_on_the_losing_customer_ends_on_plus(
    people: People,
    runtime: Runtime,
    client: TestClient,
    fake_billing: FakeBilling,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    alex = people.as_(ALEX)
    user_id = _user_id(runtime, ALEX)
    real_checkout = fake_billing.create_checkout

    def racing(**kwargs: Any) -> CheckoutLink:
        # The twin request stored its own customer while this one was at Stripe.
        with session_scope(runtime.session_factory) as db:
            db.add(
                BillingAccount(
                    user_id=user_id,
                    stripe_customer_id="cus_first",
                    plan="free",
                    status="",
                    cancel_at_period_end=False,
                    updated_at=runtime.env.now(),
                )
            )
            db.commit()
        return real_checkout(**kwargs)

    monkeypatch.setattr(fake_billing, "create_checkout", racing)
    assert alex.post("/api/billing/checkout", json={"product": "plus_monthly"}).status_code == 200
    payload, signature = _subscription_event("cus_fake", user_id)

    response = client.post(
        "/api/billing/webhook", content=payload, headers={"Stripe-Signature": signature}
    )

    assert response.status_code == 200
    account = _account(runtime, user_id)
    assert account is not None
    assert (account.stripe_customer_id, account.plan) == ("cus_fake", "plus")
    assert people.as_(ALEX).post("/api/billing/portal").json() == {
        "url": "https://portal.test/cus_fake"
    }


def test_packs_are_offered_only_where_the_free_plan_has_that_limit(
    people: People, runtime: Runtime
) -> None:
    client = people.as_(ALEX)
    runtime.settings.free_ai_uses = 0
    runtime.settings.max_update_emails_per_day = 5

    body = client.get("/api/billing").json()

    assert (body["ai_pack_available"], body["email_pack_available"]) == (False, True)


@pytest.mark.parametrize(
    ("product", "setting"),
    [("ai_pack", "free_ai_uses"), ("email_pack", "max_update_emails_per_day")],
)
def test_a_pack_the_server_has_no_limit_for_is_refused(
    people: People, runtime: Runtime, fake_billing: FakeBilling, product: str, setting: str
) -> None:
    client = people.as_(ALEX)
    runtime.settings.free_ai_uses = 20
    runtime.settings.max_update_emails_per_day = 5
    setattr(runtime.settings, setting, 0)

    response = client.post("/api/billing/checkout", json={"product": product})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "pack_not_needed"
    assert fake_billing.checkouts == []
    assert _account(runtime, _user_id(runtime, ALEX)) is None


def test_an_email_pack_is_sold_where_the_free_plan_caps_emails(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    runtime.settings.max_update_emails_per_day = 5

    response = people.as_(ALEX).post("/api/billing/checkout", json={"product": "email_pack"})

    assert response.status_code == 200
    assert fake_billing.checkouts[0]["product"].value == "email_pack"


def test_me_reports_instant_emails_usage(people: People, runtime: Runtime) -> None:
    client = people.as_(ALEX)
    runtime.env.settings.max_update_emails_per_day = 5

    capped = client.get("/api/me").json()["instant_emails"]
    runtime.env.settings.max_update_emails_per_day = 0
    uncapped = client.get("/api/me").json()["instant_emails"]

    assert capped == {"limit": 5, "used": 0, "remaining": 5}
    assert uncapped is None


@pytest.mark.parametrize(
    ("return_to", "path"),
    [
        ("/spaces", "/spaces"),
        ("/spaces?tab=shared", "/spaces?tab=shared"),
        ("/settings", "/settings"),
        ("/assistants", "/assistants"),
        ("/spaces#top", "/spaces"),
        ("//evil.com", "/settings"),
        ("https://evil.com", "/settings"),
        ("/\\evil.com", "/settings"),
        ("/settings@evil.com", "/settings"),
        ("", "/settings"),
        ("/unknown", "/settings"),
    ],
)
def test_checkout_return_to_is_validated(
    people: People,
    runtime: Runtime,
    fake_billing: FakeBilling,
    return_to: str,
    path: str,
) -> None:
    client = people.as_(ALEX)

    response = client.post(
        "/api/billing/checkout", json={"product": "ai_pack", "return_to": return_to}
    )

    assert response.status_code == 200, response.text
    base = runtime.settings.base_url
    sep = "&" if "?" in path else "?"
    call = fake_billing.checkouts[0]
    assert call["success_url"] == f"{base}{path}{sep}billing=success"
    assert call["cancel_url"] == f"{base}{path}{sep}billing=cancelled"


def test_checkout_return_to_that_is_too_long_is_refused(
    people: People, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)

    response = client.post(
        "/api/billing/checkout", json={"product": "ai_pack", "return_to": "/" + "a" * 400}
    )

    assert response.status_code == 422
    assert fake_billing.checkouts == []


def test_checkout_without_return_to_goes_back_to_settings(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)

    client.post("/api/billing/checkout", json={"product": "ai_pack"})

    call = fake_billing.checkouts[0]
    assert call["success_url"] == f"{runtime.settings.base_url}/settings?billing=success"


@pytest.mark.parametrize(
    ("return_to", "path"),
    [
        ("/spaces", "/spaces"),
        ("/spaces?tab=shared", "/spaces?tab=shared"),
        ("/assistants", "/assistants"),
        ("/settings", "/settings"),
        ("//evil.com", "/settings"),
        ("https://evil.com", "/settings"),
        ("/\evil.com", "/settings"),
        ("", "/settings"),
        ("/unknown", "/settings"),
    ],
)
def test_the_portal_returns_to_the_page_the_person_was_on(
    people: People,
    runtime: Runtime,
    fake_billing: FakeBilling,
    return_to: str,
    path: str,
) -> None:
    client = people.as_(ALEX)
    _make_plus(runtime, _user_id(runtime, ALEX))

    opened = client.post("/api/billing/portal", json={"return_to": return_to})

    assert opened.status_code == 200, opened.text
    assert fake_billing.portals[0]["return_url"] == f"{runtime.settings.base_url}{path}"


def test_a_portal_return_to_that_is_too_long_is_refused(
    people: People, runtime: Runtime, fake_billing: FakeBilling
) -> None:
    client = people.as_(ALEX)
    _make_plus(runtime, _user_id(runtime, ALEX))

    refused = client.post("/api/billing/portal", json={"return_to": "/" + "a" * 400})

    assert refused.status_code == 422
    assert fake_billing.portals == []
