from __future__ import annotations

import hashlib
import json
from typing import Any

from orbit.billing import BillingSignatureError, CheckoutLink, Product

_SIGNATURE_PREFIX = "fake-v1="


def _sign(payload: bytes) -> str:
    return _SIGNATURE_PREFIX + hashlib.sha256(payload).hexdigest()


def signed_event(
    type: str,
    data_object: dict[str, Any],
    id: str | None = None,
) -> tuple[bytes, str]:
    """A webhook body and the signature FakeBilling accepts for it."""
    event = {
        "id": id or f"evt_{type.replace('.', '_')}",
        "type": type,
        "data": {"object": data_object},
    }
    payload = json.dumps(event).encode()
    return payload, _sign(payload)


class FakeBilling:
    """Stands in for Stripe: records calls and returns canned links."""

    def __init__(self) -> None:
        self.checkouts: list[dict[str, Any]] = []
        self.portals: list[dict[str, Any]] = []
        self.cancelled_customers: list[str] = []

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
        self.checkouts.append(
            {
                "user_id": user_id,
                "email": email,
                "product": product,
                "customer_id": customer_id,
                "success_url": success_url,
                "cancel_url": cancel_url,
            }
        )
        return CheckoutLink(
            url=f"https://checkout.test/{product.value}", customer_id=customer_id or "cus_fake"
        )

    def create_portal(self, *, customer_id: str, return_url: str) -> str:
        self.portals.append({"customer_id": customer_id, "return_url": return_url})
        return f"https://portal.test/{customer_id}"

    def verify_event(self, payload: bytes, signature: str) -> dict[str, Any]:
        if signature != _sign(payload):
            raise BillingSignatureError("bad signature")
        event: dict[str, Any] = json.loads(payload)
        return event

    def cancel_customer(self, customer_id: str) -> None:
        self.cancelled_customers.append(customer_id)
