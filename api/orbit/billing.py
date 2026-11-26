from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

import stripe

from orbit.config import Settings

SUBSCRIPTION_PRODUCTS = frozenset({"plus_monthly", "plus_yearly"})


class Product(StrEnum):
    PLUS_MONTHLY = "plus_monthly"
    PLUS_YEARLY = "plus_yearly"
    AI_PACK = "ai_pack"
    EMAIL_PACK = "email_pack"


class BillingSignatureError(Exception):
    """A webhook body that did not come from Stripe, or could not be read."""


class BillingTransientError(Exception):
    """Stripe could not be reached or is failing for now; the same call may work later."""


def _is_transient(error: stripe.StripeError) -> bool:
    if isinstance(error, stripe.APIConnectionError | stripe.RateLimitError):
        return True
    status = error.http_status
    if isinstance(error, stripe.APIError) and status is None:
        return True
    return status is not None and status >= 500


@dataclass(frozen=True)
class CheckoutLink:
    url: str
    customer_id: str


class BillingGateway(Protocol):
    def create_checkout(
        self,
        *,
        user_id: str,
        email: str,
        product: Product,
        customer_id: str | None,
        success_url: str,
        cancel_url: str,
    ) -> CheckoutLink: ...

    def create_portal(self, *, customer_id: str, return_url: str) -> str: ...

    def verify_event(self, payload: bytes, signature: str) -> dict[str, Any]:
        """The event in a webhook body. Raises BillingSignatureError when it is not genuine."""
        ...

    def cancel_customer(self, customer_id: str) -> None:
        """Cancel every subscription the customer has and delete the customer.

        A customer Stripe no longer has counts as done. Raises BillingTransientError when Stripe
        cannot be reached or fails for now (connection, timeout, rate limit, server error); any
        other error is raised as it is.
        """
        ...


class StripeGateway:
    """Talks to Stripe. Card details never reach Orbit: people pay on Stripe's pages."""

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.stripe_secret_key
        self._webhook_secret = settings.stripe_webhook_secret
        self._prices = {
            Product.PLUS_MONTHLY: settings.stripe_price_plus_monthly,
            Product.PLUS_YEARLY: settings.stripe_price_plus_yearly,
            Product.AI_PACK: settings.stripe_price_ai_pack,
            Product.EMAIL_PACK: settings.stripe_price_email_pack,
        }

    def create_checkout(
        self,
        *,
        user_id: str,
        email: str,
        product: Product,
        customer_id: str | None,
        success_url: str,
        cancel_url: str,
    ) -> CheckoutLink:
        if customer_id is None:
            # One customer per person even when two checkouts start at once: Stripe returns the
            # first one's customer to the second.
            customer = stripe.Customer.create(
                email=email,
                metadata={"user_id": user_id},
                idempotency_key=f"orbit-customer-{user_id}",
                api_key=self._api_key,
            )
            customer_id = str(customer["id"])
        metadata = {"user_id": user_id, "product": product.value}
        subscription = product.value in SUBSCRIPTION_PRODUCTS
        params: dict[str, Any] = {
            "mode": "subscription" if subscription else "payment",
            "customer": customer_id,
            "client_reference_id": user_id,
            "line_items": [{"price": self._prices[product], "quantity": 1}],
            "metadata": metadata,
            "payment_method_types": ["card"],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "api_key": self._api_key,
        }
        if subscription:
            params["subscription_data"] = {"metadata": dict(metadata)}
        session = stripe.checkout.Session.create(**params)
        return CheckoutLink(url=str(session["url"]), customer_id=customer_id)

    def create_portal(self, *, customer_id: str, return_url: str) -> str:
        session = stripe.billing_portal.Session.create(
            customer=customer_id, return_url=return_url, api_key=self._api_key
        )
        return str(session["url"])

    def verify_event(self, payload: bytes, signature: str) -> dict[str, Any]:
        try:
            stripe.WebhookSignature.verify_header(
                payload, signature, self._webhook_secret, tolerance=stripe.Webhook.DEFAULT_TOLERANCE
            )
            event = json.loads(payload)
        except (stripe.error.SignatureVerificationError, ValueError) as error:
            raise BillingSignatureError("The webhook signature did not check out") from error
        if not isinstance(event, dict):
            raise BillingSignatureError("The webhook body is not an event")
        return event

    def cancel_customer(self, customer_id: str) -> None:
        try:
            listing: Any = stripe.Subscription.list(
                customer=customer_id, status="all", limit=100, api_key=self._api_key
            )
            for subscription in listing["data"]:
                if subscription["status"] in {"canceled", "incomplete_expired"}:
                    continue
                stripe.Subscription.cancel(subscription["id"], api_key=self._api_key)
            stripe.Customer.delete(customer_id, api_key=self._api_key)
        except stripe.InvalidRequestError as error:
            if error.code != "resource_missing":
                raise
        except stripe.StripeError as error:
            if _is_transient(error):
                # No message: it can name the customer.
                raise BillingTransientError(type(error).__name__) from None
            raise
