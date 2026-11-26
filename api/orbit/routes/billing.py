from __future__ import annotations

import logging
from typing import Annotated
from urllib.parse import urlsplit

import stripe
from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import IntegrityError

from orbit import schemas
from orbit.auth.deps import CurrentUser, DbSession, RuntimeDep
from orbit.billing import SUBSCRIPTION_PRODUCTS, BillingGateway, BillingSignatureError, Product
from orbit.config import Settings
from orbit.errors import (
    AlreadySubscribed,
    BadSignature,
    BillingUnavailable,
    NoBillingAccount,
    NotFound,
    PackNotNeeded,
)
from orbit.models import BillingAccount
from orbit.plans import PLAN_FREE, PLAN_PLUS, free_entitlements, plan_is_paid
from orbit.services import billing_events
from orbit.services.billing_state import KIND_AI, KIND_EMAIL, pack_credits_left

log = logging.getLogger(__name__)

# Subscription statuses Stripe never moves on from: only these leave room for a new one.
ENDED_SUBSCRIPTION_STATUSES = frozenset({"canceled", "incomplete_expired"})

# Pages a person may be sent back to after Stripe, by their first path segment.
RETURN_SEGMENTS = frozenset({"spaces", "assistants", "settings"})
DEFAULT_RETURN = "/settings"


def checkout_return_path(raw: str | None) -> str:
    """A page on this site to send the person back to, or Settings for anything else.

    Only a relative path whose first segment is one of RETURN_SEGMENTS is kept, so the value can
    never send someone to another site. A fragment is dropped; a query is kept.
    """
    if not raw or not raw.startswith("/") or raw.startswith("//") or "\\" in raw:
        return DEFAULT_RETURN
    if any(ord(char) < 32 or ord(char) == 127 for char in raw):
        return DEFAULT_RETURN
    parts = urlsplit(raw)
    if parts.scheme or parts.netloc:
        return DEFAULT_RETURN
    segments = parts.path.split("/")
    if len(segments) < 2 or segments[1] not in RETURN_SEGMENTS:
        return DEFAULT_RETURN
    return f"{parts.path}?{parts.query}" if parts.query else parts.path


router = APIRouter(tags=["billing"])
# Mounted outside the same-origin check: Stripe is not a browser, and the signature is the
# only authentication this route has.
webhook_router = APIRouter(tags=["billing"])


def billing_gateway(runtime: RuntimeDep) -> BillingGateway:
    gateway = runtime.env.billing
    if gateway is None:
        raise NotFound("Paid plans are not turned on here.")
    return gateway


Gateway = Annotated[BillingGateway, Depends(billing_gateway)]


def _packs_available(settings: Settings) -> dict[Product, bool]:
    """A pack tops up a Free limit; where the server sets none, there is nothing to buy."""
    free = free_entitlements(settings)
    return {
        Product.AI_PACK: free.ai_uses_per_month is not None,
        Product.EMAIL_PACK: free.instant_emails_per_day is not None,
    }


@router.get("/billing/public")
def billing_public(runtime: RuntimeDep) -> schemas.BillingPublicOut:
    return schemas.BillingPublicOut(enabled=runtime.env.billing is not None)


@router.get("/billing")
def read_billing(
    user: CurrentUser, db: DbSession, runtime: RuntimeDep, _gateway: Gateway
) -> schemas.BillingOut:
    now = runtime.env.now()
    account = db.get(BillingAccount, user.id)
    paid = account is not None and plan_is_paid(account.plan, account.status)
    packs = _packs_available(runtime.settings)
    return schemas.BillingOut(
        plan=PLAN_PLUS if paid else PLAN_FREE,
        status=account.status if account is not None else "",
        period_end=account.period_end if account is not None else None,
        cancel_at_period_end=account.cancel_at_period_end if account is not None else False,
        ai_pack_credits=pack_credits_left(db, user.id, KIND_AI, now),
        email_pack_credits=pack_credits_left(db, user.id, KIND_EMAIL, now),
        can_manage=account is not None,
        ai_pack_available=packs[Product.AI_PACK],
        email_pack_available=packs[Product.EMAIL_PACK],
    )


@router.post("/billing/checkout")
def start_checkout(
    body: schemas.CheckoutIn,
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
    gateway: Gateway,
) -> schemas.UrlOut:
    if not _packs_available(runtime.settings).get(body.product, True):
        raise PackNotNeeded("This server sets no limit for that, so there is nothing to top up.")
    account = db.get(BillingAccount, user.id)
    if body.product.value in SUBSCRIPTION_PRODUCTS and account is not None:
        if plan_is_paid(account.plan, account.status):
            raise AlreadySubscribed(
                "You are already on Plus. Manage it from your billing settings."
            )
        if (
            account.stripe_subscription_id is not None
            and account.status not in ENDED_SUBSCRIPTION_STATUSES
        ):
            # A second subscription would bill alongside the first; fix the open one instead.
            raise AlreadySubscribed(
                "You already have a Plus subscription. Manage it from your billing settings."
            )
    base = runtime.settings.base_url
    back = checkout_return_path(body.return_to)
    joiner = "&" if "?" in back else "?"
    user_id, email = user.id, user.email
    customer_id = account.stripe_customer_id if account is not None else None
    # Release the write lock the sign-in lookup took before the slow call to Stripe.
    db.rollback()
    try:
        link = gateway.create_checkout(
            user_id=user_id,
            email=email,
            product=body.product,
            customer_id=customer_id,
            success_url=f"{base}{back}{joiner}billing=success",
            cancel_url=f"{base}{back}{joiner}billing=cancelled",
        )
    except stripe.StripeError as error:
        log.warning("Stripe refused a checkout: %s", type(error).__name__)
        raise BillingUnavailable("Payments are unavailable right now. Please try again.") from None
    if customer_id is None:
        # Saved before the person is sent to Stripe, so a webhook that arrives first finds it.
        db.add(
            BillingAccount(
                user_id=user_id,
                stripe_customer_id=link.customer_id,
                plan=PLAN_FREE,
                status="",
                cancel_at_period_end=False,
                updated_at=runtime.env.now(),
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # A twin checkout saved an account first; its customer id stays.
            db.rollback()
    return schemas.UrlOut(url=link.url)


@router.post("/billing/portal")
def open_portal(
    user: CurrentUser,
    db: DbSession,
    runtime: RuntimeDep,
    gateway: Gateway,
    body: schemas.PortalIn | None = None,
) -> schemas.UrlOut:
    account = db.get(BillingAccount, user.id)
    if account is None:
        raise NoBillingAccount("You have no billing account yet.")
    customer_id = account.stripe_customer_id
    back = checkout_return_path(body.return_to if body is not None else None)
    db.rollback()
    try:
        url = gateway.create_portal(
            customer_id=customer_id,
            return_url=f"{runtime.settings.base_url}{back}",
        )
    except stripe.StripeError as error:
        log.warning("Stripe refused a portal link: %s", type(error).__name__)
        raise BillingUnavailable("Billing is unavailable right now. Please try again.") from None
    return schemas.UrlOut(url=url)


@webhook_router.post("/api/billing/webhook")
async def stripe_webhook(
    request: Request, db: DbSession, runtime: RuntimeDep, gateway: Gateway
) -> dict[str, bool]:
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise BadSignature("The webhook signature is missing.")
    try:
        event = gateway.verify_event(payload, signature)
    except BillingSignatureError:
        # Fixed message only: the error chain can carry the request body.
        log.warning("A Stripe webhook failed signature checking")
        raise BadSignature("The webhook signature is not valid.") from None
    await run_in_threadpool(
        billing_events.handle_event, db, runtime.settings, event, runtime.env.now()
    )
    return {"received": True}
