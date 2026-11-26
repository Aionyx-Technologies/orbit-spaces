# Paid plan and credit packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in person buy a Plus subscription and packs of extra AI uses and instant update emails through Stripe, with every limit read from their plan.

**Architecture:** One `plans.py` table and an `entitlements_for` resolver replace the scattered caps. Bought packs are rows in `credit_grants`, spent through a nullable `grant_id` on the AI use ledger and on a new persistent email send log. Stripe Checkout and the Customer Portal do the paying; a signed webhook is the only thing that changes plan state or creates grants. All of it is off when Stripe is not configured.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic (SQLite and Postgres), the official `stripe` Python package, Next.js, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-11-24-paid-plans-and-credits-design.md`. Builds on #47 (`orbit/services/ai_uses.py`, migration `0007`).

## Global Constraints

- Billing is on only when `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_AI_PACK` and `STRIPE_PRICE_EMAIL_PACK` are all set. Otherwise nothing changes for the person, and no billing UI shows.
- Card numbers and payment details are never stored or logged. Orbit stores only the Stripe customer id, plan, status, period dates, and grant records.
- Plus entitlements: 150 AI uses a month, 25 instant update emails a day, no limit on owned spaces, 25 people per space. Free keeps `ORBIT_FREE_AI_USES` (20), `ORBIT_MAX_UPDATE_EMAILS_PER_DAY` (5), `ORBIT_MAX_CREATED_SPACES` (5), 10 people.
- Packs: AI pack = 100 uses, email pack = 500 emails; both last 365 days. A pack is spent only after the plan's own allowance for the period is used up, earliest expiry first.
- A failed AI call gives its use back to where it came from (monthly allowance or the same pack).
- Webhook: unverified signature changes nothing (HTTP 400); an event id seen before changes nothing (HTTP 200); pack grants come only from `checkout.session.completed` with `mode == "payment"` and `payment_status == "paid"`; plan state comes only from `customer.subscription.*` events.
- The webhook route is `POST /api/billing/webhook`, mounted outside the same-origin dependency (it is authenticated by Stripe's signature). No proxy changes are needed.
- Migrations add a changelog line under **Migrations** (a test fails otherwise). New settings go in `.env.example`, `docs/self-hosting.md` and the changelog.
- Tests run on SQLite and Postgres. Python: `api/.venv/Scripts/python.exe -m pytest`, ruff and mypy clean. Web: `.types.ts` file beside each component with props, prettier, eslint `--max-warnings 0`, `npm run typecheck`.
- Self-hosted servers without Stripe must behave exactly as today.

## Review Focus

- A Stripe webhook delivered twice, or two events racing, creates one grant, not two (Task 7).
- A forged or unsigned webhook, or one for an unknown customer, changes nothing and returns an error or a no-op (Tasks 7, 8).
- Two AI uses racing for the last pack credit spend it once; the loser gets `402` (Task 3).
- A use paid by a pack and then failed is refunded to that pack, not to the monthly allowance (Task 3).
- An expired or revoked pack is never spent (Tasks 3, 4).
- A cancelled or unpaid subscription drops to Free; spaces over the Free member cap keep their members but cannot add more (Tasks 5, 7).
- A refunded pack stops being spendable but credits already spent stay spent (Task 7).
- With billing off, `/api/billing` routes return 404 and `/api/me` reports `billing_enabled: false` (Task 8).

---

# Stage 1: Plans, grants and spending

### Task 1: Plans and the entitlements resolver

**Files:**
- Create: `api/orbit/plans.py`
- Test: `api/tests/test_plans.py`

**Interfaces:**
- Produces: `PLAN_FREE = "free"`, `PLAN_PLUS = "plus"`; `@dataclass(frozen=True) class Entitlements: plan: str; ai_uses_per_month: int | None; instant_emails_per_day: int | None; max_created_spaces: int | None; members_per_space: int` (None means no limit); `PLUS_AI_USES = 150`, `PLUS_INSTANT_EMAILS = 25`, `PLUS_MEMBERS_PER_SPACE = 25`, `AI_PACK_USES = 100`, `EMAIL_PACK_CREDITS = 500`, `GRANT_TTL = timedelta(days=365)`; `def free_entitlements(settings: Settings) -> Entitlements`; `def plus_entitlements() -> Entitlements`; `def plan_is_paid(plan: str, status: str) -> bool` (true for plan `plus` with status `active`, `trialing` or `past_due`).
- Consumes: `Settings` fields `free_ai_uses`, `max_update_emails_per_day`, `max_created_spaces`; `limits.MEMBERS_PER_SPACE`.

- [ ] **Step 1: Write failing tests** `test_free_entitlements_read_the_settings` (defaults give `ai_uses_per_month == 20`, `instant_emails_per_day is None` when the setting is 0, `members_per_space == 10`), `test_a_zero_setting_means_no_limit`, `test_plus_entitlements_are_the_spec_values`, `test_only_active_trialing_and_past_due_plus_count_as_paid` (parametrised over statuses including `canceled`, `unpaid`, `incomplete_expired`).
- [ ] **Step 2: Run** `pytest tests/test_plans.py -v`. Expected: FAIL, no module.
- [ ] **Step 3: Implement** `orbit/plans.py` as above, mapping a setting of `0` to `None`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add api/orbit/plans.py api/tests/test_plans.py && git commit -m "Add plans and entitlements"`.

### Task 2: Billing tables and migration 0008

**Files:**
- Modify: `api/orbit/models.py` (add three models, one column)
- Create: `api/alembic/versions/0008_billing.py`
- Modify: `CHANGELOG.md` (Migrations section: migration `0008`)
- Test: `api/tests/test_billing_models.py`

**Interfaces:**
- Produces models: `BillingAccount` (`user_id` pk fk users cascade, `stripe_customer_id` unique String(64), `plan` String(16) default `free`, `status` String(32) default `""`, `period_start` / `period_end` nullable datetimes, `cancel_at_period_end` Boolean default false, `updated_at`); `CreditGrant` (`id`, `user_id` fk cascade indexed, `kind` String(8) `ai`|`email`, `amount` Integer, `expires_at`, `stripe_event_id` String(64) unique, `stripe_payment_intent` String(80) nullable indexed, `created_at`, `revoked_at` nullable); `StripeEvent` (`id` String(64) pk, `type` String(64), `received_at`); `EmailSend` table `email_send_log` (`id`, `user_id` fk cascade, `sent_at`, `grant_id` fk credit_grants nullable, index on `(user_id, sent_at)`).
- Modifies: `AiUseEntry` gains `grant_id` nullable fk `credit_grants.id`.
- Consumes: migration `0007`.

- [ ] **Step 1: Write failing tests** `test_deleting_a_user_removes_billing_rows` (account, grant, send log) and `test_a_stripe_event_id_is_unique`. The existing `test_migrations_leave_no_drift_from_the_models` must keep passing.
- [ ] **Step 2: Run** `pytest tests/test_billing_models.py tests/test_migrations.py -v`. Expected: FAIL.
- [ ] **Step 3: Add the models and migration** following `0007`'s style (`sa.DateTime(timezone=True)`, `op.f(...)` constraint names, SQLite batch mode for the `ai_use_ledger.grant_id` column). Add the changelog line: migration `0008` adds the billing tables, adds `ai_use_ledger.grant_id`, only adds, no backup needed beyond the usual.
- [ ] **Step 4: Run** the step 2 command plus `tests/test_changelog_migrations.py`. Expected: PASS.
- [ ] **Step 5: Commit** "Add billing tables".

### Task 3: AI uses spend from the plan, then from packs

**Files:**
- Create: `api/orbit/services/billing_state.py` (plan lookup, grant arithmetic shared by AI and email)
- Modify: `api/orbit/services/ai_uses.py`
- Test: `api/tests/test_ai_uses_packs.py`; keep `api/tests/test_ai_uses.py` passing

**Interfaces:**
- Produces in `billing_state.py`: `def entitlements_for(db: Session, settings: Settings, user_id: str, now: datetime) -> Entitlements` (Plus entitlements when the user's `BillingAccount` is paid per `plan_is_paid`, else Free); `def billing_period(db, user: User, settings, now) -> tuple[datetime, datetime]` (the subscription's `period_start`/`period_end` while paid, else `ai_uses.period_bounds(user.created_at, now)`); `def grant_remaining(db: Session, grant: CreditGrant) -> int` (amount minus spends that carry its id: AI ledger deltas for kind `ai`, email send rows for kind `email`); `def spendable_grant(db, user_id: str, kind: str, now: datetime) -> CreditGrant | None` (not revoked, not expired, remaining > 0, earliest `expires_at` first, row-locked with `with_for_update()`); `def pack_credits_left(db, user_id, kind, now) -> int`.
- Changes: `Reservation` gains `grant_id: str | None`; `reserve(...)` first spends from the monthly allowance (ledger rows in the current period with `grant_id` null, limit from `entitlements_for`), then from `spendable_grant(db, user_id, "ai", now)`, writing a ledger row with that `grant_id`, else raises `AiUsesExhausted`; `allowance` counts only `grant_id is None` rows and uses the entitlement limit and `billing_period`; `refund` copies `grant_id` from the original entry.
- Consumes: Task 1, Task 2.

- [ ] **Step 1: Write failing tests** `test_plus_gets_150_uses_a_month`; `test_a_pack_is_spent_after_the_monthly_allowance` (20 monthly, then 100 pack, then `AiUsesExhausted`); `test_a_failed_use_paid_by_a_pack_goes_back_to_the_pack`; `test_the_earliest_expiring_pack_is_spent_first`; `test_an_expired_pack_is_not_spent`; `test_a_revoked_pack_is_not_spent`; `test_two_requests_racing_for_the_last_pack_credit_spend_it_once` (threads against SQLite; mirror the pattern in `tests/test_concurrency_races.py`); `test_a_paid_person_period_follows_the_subscription`. Each pack test creates a `CreditGrant` directly.
- [ ] **Step 2: Run** `pytest tests/test_ai_uses_packs.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above. The user row lock in `reserve` already serializes spends, so `spendable_grant` locks only for Postgres clarity.
- [ ] **Step 4: Run** `pytest tests/test_ai_uses_packs.py tests/test_ai_uses.py tests/test_rest_combine.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** "Spend AI uses from the plan, then from packs".

### Task 4: Instant update emails use a persistent count and email packs

**Files:**
- Create: `api/orbit/services/email_allowance.py`
- Modify: `api/orbit/services/notify.py` (replace `_within_daily_allowance` and `_used_the_last_allowance`, lines ~184-193)
- Test: `api/tests/test_email_allowance.py`; existing `tests/test_notify_frequency.py` must keep passing

**Interfaces:**
- Produces: `def try_send(db: Session, settings: Settings, user_id: str, now: datetime) -> bool` (true and records an `EmailSend` row when the person's sends in the last 24 hours with `grant_id` null are under `entitlements_for(...).instant_emails_per_day`, or None; otherwise spends from `spendable_grant(db, user_id, "email", now)` and records the row with its `grant_id`; false when neither is possible, recording nothing); `def used_the_last_allowance(db, settings, user_id, now) -> bool` (true when the plan cap is set and the count of unpaid-by-pack sends in 24 hours is at or above it and no pack credit remains); `def prune(db, now) -> int` (deletes send rows older than 2 days, returns the count).
- Consumes: Task 1, Task 3 (`entitlements_for`, `spendable_grant`).

- [ ] **Step 1: Write failing tests** `test_sends_under_the_free_cap_are_recorded`; `test_the_sixth_free_send_in_a_day_is_refused`; `test_a_plus_person_gets_25_a_day`; `test_an_email_pack_pays_for_sends_past_the_cap`; `test_counts_survive_a_new_session` (record, new session, count still there, proving it is not in memory); `test_prune_removes_old_rows`.
- [ ] **Step 2: Run** `pytest tests/test_email_allowance.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the three functions, then change `Notifier` to open a session through `session_factory` (already passed to `flush`) and call `try_send` and `used_the_last_allowance` with `self._clock()`. Held-back mail still goes to `_overflow` exactly as today. Call `prune` from the existing daily janitor tick in `services/janitor.py`.
- [ ] **Step 4: Run** `pytest tests/test_email_allowance.py tests/test_notify.py tests/test_notify_frequency.py tests/test_connections_and_janitor.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** "Count instant emails in the database and sell packs".

### Task 5: Space and member caps follow the plan

**Files:**
- Modify: `api/orbit/services/spaces.py` (created-space cap at lines ~72 and ~170), `api/orbit/services/invites.py` (lines ~143 and ~245), `api/orbit/render.py` (lines ~119, ~130), `api/orbit/routes/spaces.py` (line ~47)
- Test: `api/tests/test_plan_caps.py`

**Interfaces:**
- Produces: `def members_cap(db: Session, settings: Settings, space: Space, now: datetime) -> int` in `billing_state.py` (the space owner's `members_per_space`; owner = `space.created_by`; falls back to 10 when the owner is gone); the created-space cap reads `entitlements_for(...).max_created_spaces` (None = no limit).
- Consumes: Task 3 (`entitlements_for`).

- [ ] **Step 1: Write failing tests** `test_a_plus_owner_can_create_more_than_five_spaces`; `test_a_plus_owners_space_holds_25_people`; `test_a_free_owners_space_still_holds_10`; `test_a_space_over_the_free_cap_after_cancelling_keeps_its_members_but_cannot_add` (owner downgraded after 15 members: invite and accept raise `LimitReached`, existing members untouched); `test_the_error_message_names_the_real_cap`.
- [ ] **Step 2: Run** `pytest tests/test_plan_caps.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `members_cap` and swap each `MEMBERS_PER_SPACE` comparison and message for it. In `render.py`, which has no session, pass the cap in from the caller or keep a conservative `MEMBERS_PER_SPACE` there; choose the latter and leave a comment, since it only decides whether to suggest "invite more".
- [ ] **Step 4: Run** `pytest tests/test_plan_caps.py tests/test_create_space_facts.py tests/test_rest_waiting_invites.py tests/test_mcp_invitation_tools.py -v` and the full `pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit** "Make space and member caps depend on the plan".

---

# Stage 2: Stripe

### Task 6: Configuration, the gateway and a fake

**Files:**
- Modify: `api/pyproject.toml` (add `stripe` dependency), `api/orbit/config.py`, `api/orbit/services/context.py`, `api/orbit/main.py`, `.env.example`
- Create: `api/orbit/billing.py`, `api/tests/billing_helpers.py`
- Test: `api/tests/test_billing_config.py`

**Interfaces:**
- Produces settings: `stripe_secret_key`, `stripe_webhook_secret`, `stripe_price_plus_monthly`, `stripe_price_plus_yearly`, `stripe_price_ai_pack`, `stripe_price_email_pack` (env `STRIPE_*`, default empty); property `billing_enabled` (all six set).
- Produces in `orbit/billing.py`: `class Product(StrEnum)`: `PLUS_MONTHLY="plus_monthly"`, `PLUS_YEARLY="plus_yearly"`, `AI_PACK="ai_pack"`, `EMAIL_PACK="email_pack"`; `@dataclass(frozen=True) class CheckoutLink: url: str; customer_id: str`; `class BillingGateway(Protocol)`: `create_checkout(self, *, user_id: str, email: str, product: Product, customer_id: str | None, success_url: str, cancel_url: str) -> CheckoutLink`; `create_portal(self, *, customer_id: str, return_url: str) -> str`; `verify_event(self, payload: bytes, signature: str) -> dict[str, Any]` (raises `BillingSignatureError`); `cancel_customer(self, customer_id: str) -> None` (cancels subscriptions and deletes the customer); `class StripeGateway` implementing it with the `stripe` package (subscriptions use `mode="subscription"`, packs `mode="payment"`, both put `user_id` and `product` in session `metadata` and set `client_reference_id`); `class BillingSignatureError(Exception)`.
- Produces: `Env.billing: BillingGateway | None` (field beside `llm`), `Overrides.billing`, built from settings in `create_app` when `billing_enabled`; `tests/billing_helpers.py::FakeBilling` recording calls and returning canned links, and a `signed_event(type, data_object, id=None) -> tuple[bytes, str]` helper the fake's `verify_event` accepts.

- [ ] **Step 1: Write failing tests** `test_billing_is_off_unless_every_stripe_setting_is_set`; `test_a_server_without_stripe_has_no_gateway` (`runtime.env.billing is None`); `test_checkout_metadata_carries_the_user_and_product` (against a stubbed `stripe` client module, no network).
- [ ] **Step 2: Run** `pytest tests/test_billing_config.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the settings, gateway and wiring. Document the settings in `.env.example` (with a note that Stripe test keys start `sk_test_`), `docs/self-hosting.md` and the changelog.
- [ ] **Step 4: Run** `pytest tests/test_billing_config.py tests/test_config.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** "Add Stripe configuration and gateway".

### Task 7: Webhook event handling

**Files:**
- Create: `api/orbit/services/billing_events.py`
- Test: `api/tests/test_billing_events.py`

**Interfaces:**
- Produces: `def handle_event(db: Session, settings: Settings, event: dict[str, Any], now: datetime) -> bool` (true when the event changed something; false when it was already seen or irrelevant). It first inserts a `StripeEvent` row for `event["id"]` and returns false if that id exists (catch the unique violation, so two racing deliveries record once), then dispatches on `event["type"]`:
  - `checkout.session.completed`: only when `mode == "payment"` and `payment_status == "paid"`; reads `metadata.user_id` and `metadata.product`; creates a `CreditGrant` (`ai` for `ai_pack` with `AI_PACK_USES`, `email` for `email_pack` with `EMAIL_PACK_CREDITS`, `expires_at = now + GRANT_TTL`, `stripe_event_id = event["id"]`, `stripe_payment_intent` from the session). For subscription-mode sessions it only stores the customer id on a `BillingAccount` (creating it with plan `free` if missing).
  - `customer.subscription.created` / `updated`: finds the `BillingAccount` by `stripe_customer_id` (ignores unknown customers), sets `plan` to `plus` or `free` per `plan_is_paid`, `status`, `period_start`/`period_end` (read `current_period_start`/`current_period_end` from the subscription, or from `items.data[0]` where the API version puts them), `cancel_at_period_end`.
  - `customer.subscription.deleted`: plan `free`, status `canceled`.
  - `charge.refunded`: sets `revoked_at` on the grant whose `stripe_payment_intent` matches; spent credits stay spent.
  - `invoice.payment_failed`: logged only.
- Consumes: Task 2, Task 1 (`plan_is_paid`, pack constants).

- [ ] **Step 1: Write failing tests** `test_a_paid_ai_pack_creates_one_grant`; `test_the_same_event_twice_creates_one_grant`; `test_two_racing_deliveries_create_one_grant` (two sessions inserting the same event id); `test_an_unpaid_or_subscription_session_creates_no_grant`; `test_a_subscription_update_makes_a_person_plus_with_period_dates`; `test_a_subscription_for_an_unknown_customer_is_ignored`; `test_a_canceled_subscription_drops_to_free`; `test_a_refund_revokes_the_unspent_credits_only` (spend 30 of 100 first, revoke, assert 30 spent remain counted and 0 spendable); `test_an_unknown_event_type_is_recorded_and_ignored`.
- [ ] **Step 2: Run** `pytest tests/test_billing_events.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `handle_event` with one commit at the end so a failure rolls the `StripeEvent` row back and Stripe's retry reprocesses it.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** "Handle Stripe webhook events".

### Task 8: Billing routes and the `/me` fields

**Files:**
- Create: `api/orbit/routes/billing.py`
- Modify: `api/orbit/routes/__init__.py`, `api/orbit/main.py` (include the webhook router outside the same-origin dependency), `api/orbit/routes/me.py`, `api/orbit/schemas.py`
- Test: `api/tests/test_rest_billing.py`

**Interfaces:**
- Produces routes (all 404 when `runtime.env.billing is None`): `GET /api/billing` returning `BillingOut` (`plan`, `status`, `period_end`, `cancel_at_period_end`, `ai_pack_credits: int`, `email_pack_credits: int`, `can_manage: bool` (a customer id exists)); `POST /api/billing/checkout` body `{product: Product}` returning `{url: str}` (stores the customer id on a new `BillingAccount` when first created; success URL `{base_url}/settings?billing=success`, cancel `?billing=cancelled`; refuses `plus_*` when already on Plus with 409 `already_subscribed`); `POST /api/billing/portal` returning `{url: str}` (409 `no_billing_account` without a customer); `POST /api/billing/webhook` (raw body, `Stripe-Signature` header; 400 `bad_signature` on `BillingSignatureError`; 200 otherwise, calling `handle_event`); `GET /api/billing/public` (no sign-in) returning `{enabled: bool}`, which is the one billing route that answers when billing is off.
- Produces: `MeOut` gains `plan: str` and `billing_enabled: bool`; `AiUsesOut.limit` already carries the entitlement limit.
- Consumes: Tasks 3, 6, 7.

- [ ] **Step 1: Write failing tests** `test_checkout_returns_the_gateway_url_and_remembers_the_customer`; `test_checkout_for_plus_when_already_plus_is_refused`; `test_portal_needs_a_billing_account`; `test_a_validly_signed_webhook_changes_the_plan`; `test_a_webhook_with_a_bad_signature_is_rejected_and_changes_nothing`; `test_the_webhook_needs_no_origin_header`; `test_billing_routes_are_404_when_billing_is_off`; `test_public_reports_whether_billing_is_on`; `test_me_reports_the_plan_and_billing_enabled`; `test_a_signed_out_person_cannot_check_out`.
- [ ] **Step 2: Run** `pytest tests/test_rest_billing.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the router. The webhook reads `await request.body()`; keep it a plain `def` handler where possible but use `async def` for the body read. Add the dedicated router in `main.py` next to the other `include_router` calls.
- [ ] **Step 4: Run** `pytest tests/test_rest_billing.py tests/test_rest_core.py -v` and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** "Add billing routes".

### Task 9: Deleting an account ends its Stripe customer

**Files:**
- Modify: `api/orbit/services/accounts.py` (`delete_account`), `api/orbit/services/account_export.py` (include plan, status, period dates and grant records; never the customer id's secrets), `docs/data-policy.md`
- Test: `api/tests/test_account_billing.py`

**Interfaces:**
- Consumes: `Env.billing.cancel_customer`, Task 2 tables. `delete_account` calls `cancel_customer` before deleting rows, and still deletes the account if Stripe fails (logs the failure and records nothing sensitive).

- [ ] **Step 1: Write failing tests** `test_deleting_an_account_cancels_the_stripe_customer`; `test_a_stripe_failure_does_not_block_deletion`; `test_the_export_includes_plan_and_grants_but_not_stripe_ids`.
- [ ] **Step 2: Run** `pytest tests/test_account_billing.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `pytest tests/test_account_billing.py tests/test_account_export.py tests/test_connections_and_janitor.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** "End the Stripe customer when an account is deleted".

---

# Stage 3: Web, landing and legal

### Task 10: Billing section in Settings

**Files:**
- Modify: `web/lib/api.types.ts`, `web/lib/api.ts`, `web/lib/queries.ts`, `web/tests/unit/helpers/fixtures.ts`, `web/components/settings/settings-screen.tsx`, `web/components/common/ai-uses-note.tsx`, `web/components/space/plan-card.tsx` (pass `billingEnabled`)
- Create: `web/components/settings/billing-section.tsx` and `billing-section.types.ts`
- Test: `web/tests/unit/components/settings/billing-section.test.tsx`; update `ai-uses-note.test.tsx`, `plan-card.test.tsx`

**Interfaces:**
- Produces types `Billing` (matching `BillingOut`), `Product = "plus_monthly" | "plus_yearly" | "ai_pack" | "email_pack"`; `Me` gains `plan: string`, `billing_enabled: boolean`; `api.billing.get()`, `api.billing.checkout(product)`, `api.billing.portal()` (both return `{ url }`); `BillingSection({ me }: BillingSectionProps)` rendering nothing unless `me.billing_enabled`.
- Behavior: shows the plan and renewal date (or "Ends on …" when `cancel_at_period_end`), AI uses and email credits left, buttons "Upgrade to Plus" (monthly and yearly), "Buy 100 AI uses", "Buy 500 emails", "Manage subscription" (when `can_manage`); each button posts to checkout or portal and then `window.location.assign(url)` through a small `navigateTo`-style helper already in `lib/navigation.ts`; reads `?billing=success` and shows a status message once. `AiUsesNote` says "Buy more or upgrade in Settings" with a link when billing is on, and keeps "coming soon" when off.

- [ ] **Step 1: Write failing tests** `renders nothing when billing is off`; `shows the plan and what is left`; `sends the person to Stripe from each buy button` (assert the right product posted and navigation called with the returned url); `shows Manage subscription only with a billing account`; `shows an error when checkout fails`; `says the subscription ends when it is set to cancel`; `AiUsesNote links to Settings when billing is on`.
- [ ] **Step 2: Run** `node scripts/vitest.mjs run tests/unit/components/settings/billing-section.test.tsx tests/unit/components/common/ai-uses-note.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the types, api methods, component and wiring. Run prettier on every file touched.
- [ ] **Step 4: Run** the same command plus `npm run typecheck` and `npx eslint components tests --max-warnings 0`. Expected: PASS.
- [ ] **Step 5: Commit** "Add the Billing section to Settings".

### Task 11: Landing pricing goes live for Plus

**Files:**
- Create: `web/lib/billing-public.ts` (`readBillingEnabled(): Promise<boolean>` like `readDemo`, calling `/api/billing/public`)
- Modify: `web/app/page.tsx`, `web/components/landing/landing.tsx`, `landing.types.ts`, `web/components/landing/how-it-works.tsx`, `web/components/landing/pricing.tsx`
- Test: `web/tests/unit/components/landing/pricing.test.tsx`

**Interfaces:**
- `Pricing({ billingEnabled }: PricingProps)`. With billing on, Plus loses its "Coming soon" badge and gets a "Get Plus" link to `/auth/sign-in?next=/settings`; the Plus card drops the "Full history of everything shared" line in both states; an add-ons row lists "Extra AI: 100 AI uses" and "Extra emails: 500 instant update emails" when on. With billing off, the cards render as in #48. Team stays "Coming soon" always.

- [ ] **Step 1: Write failing tests** `Plus is coming soon when billing is off`; `Plus has a Get Plus link and no badge when billing is on`; `Team is coming soon either way`; `the add-ons show only when billing is on`; `Plus no longer lists full history`.
- [ ] **Step 2: Run** `node scripts/vitest.mjs run tests/unit/components/landing/pricing.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**, defaulting `billingEnabled` to false so existing callers and tests keep working.
- [ ] **Step 4: Run** `node scripts/vitest.mjs run tests/unit/components/landing` and typecheck and eslint. Expected: PASS.
- [ ] **Step 5: Commit** "Make the landing page pricing live for Plus".

### Task 12: Legal pages, docs and the final check

**Files:**
- Modify: `web/components/legal/terms-content.tsx`, `privacy-content.tsx`, `data-policy-content.tsx` and their tests, `docs/self-hosting.md` (a Stripe section: keys, webhook endpoint `https://<host>/api/billing/webhook`, the four prices, test mode first), `CHANGELOG.md`, `README.md` limits line about billing
- Test: existing legal content tests, extended

**Interfaces:** none new. Content: Stripe is a processor; Orbit stores customer id, plan, dates and credit records, never card data; refunds revoke unspent credits; cancel any time in Settings or the portal and keep the plan until the period ends; credits last 12 months; tax is the operator's responsibility. Shown only as text; the pages stay accurate when billing is off by wording it "if this server takes payments".

- [ ] **Step 1: Write failing tests** asserting each page mentions Stripe, the 12-month credit life and that card details never reach Orbit.
- [ ] **Step 2: Run** `node scripts/vitest.mjs run tests/unit/components/legal`. Expected: FAIL.
- [ ] **Step 3: Write the copy** and the self-hosting section; update the changelog.
- [ ] **Step 4: Run** full backend `pytest -q`, ruff, ruff format, mypy; web typecheck, eslint, and the landing, settings, legal and space test folders. Expected: all PASS.
- [ ] **Step 5: Commit** "Document payments in the legal pages and self-hosting guide".

---

## Manual check with Stripe test keys (owner)

After Task 12, with test keys: create the four prices in test mode, set the six `STRIPE_*` variables, add a webhook endpoint at `/api/billing/webhook` for the events in Task 7, run the Stripe CLI (`stripe listen --forward-to`), then buy each product with card `4242 4242 4242 4242` and confirm the Billing card, the AI uses count and the email credits update.
