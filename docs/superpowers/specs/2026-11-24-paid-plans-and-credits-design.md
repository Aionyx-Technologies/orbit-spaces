# Paid plan and credit packs (Stripe)

Status: approved by the owner and implemented on the `feat/paid-plans` branch (2026-11-25).

## Intent
Let people pay Orbit's cloud: a Plus subscription with bigger allowances, and one-off packs of extra AI uses and extra instant update emails. The owner wants real purchases in Stripe, with test keys first. Team (organizations, seats, a shared pool) is phase 2 and stays "coming soon".

Builds on #47 (the monthly AI use ledger, `ORBIT_FREE_AI_USES`) and the free-tier limits (`ORBIT_MAX_CREATED_SPACES`, `ORBIT_MAX_UPDATE_EMAILS_PER_DAY`).

## Goals
- A signed-in person can subscribe to Plus (monthly or yearly), manage or cancel it, and buy AI packs and email packs, all from Settings. Card details are only ever typed on Stripe's pages.
- Plus raises: AI uses a month, instant update emails a day, spaces you can own, and people per space.
- Packs add credits that are spent only after the plan's own allowance for that period runs out, and last 12 months.
- A failed AI call still gives its use back, whether it came from the monthly allowance or from a pack.
- Everything is off unless Stripe is configured. A server without Stripe keys behaves exactly as today and shows no billing anywhere.

## Non-goals
- Team plan, organizations, seats, a shared AI pool (phase 2).
- Coupons, trials, tax-exempt flows, custom invoices, usage-based billing.
- Bring-your-own AI key.
- Storing card numbers or any payment details in Orbit's database.

## Anti-goals
- A person is never charged twice for one purchase (webhooks can repeat).
- A person is never left paying for a plan that Orbit shows as Free, or the other way round.
- A webhook that cannot be verified never changes anything.
- Credits never silently disappear before their expiry.

## Approaches considered
1. **Stripe Checkout and Customer Portal, with webhooks as the source of truth (chosen).** Stripe hosts payment, plan changes, cancellation, receipts and card updates. Orbit creates a Checkout Session, sends the person to Stripe, and trusts only the signed webhook. Least code, least PCI scope.
2. Stripe Elements with a custom payment form. Prettier, but Orbit then owns far more of the payment surface for no gain at this size.
3. A different provider (Paddle, Lemon Squeezy) that acts as merchant of record and handles sales tax. Worth a look if tax is a worry, but the owner chose Stripe.

## Design

### Plans and entitlements
One table in code, `orbit/plans.py`, maps a plan (`free`, `plus`) to its entitlements. Defaults are my calls, so the owner should check them:

| | Free | Plus |
|---|---|---|
| AI uses a month | 20 (`ORBIT_FREE_AI_USES`) | 150 |
| Instant update emails a day | 5 (`ORBIT_MAX_UPDATE_EMAILS_PER_DAY`) | 25 |
| Spaces you can own | 5 (`ORBIT_MAX_CREATED_SPACES`) | no limit |
| People per space | 10 | 25 |

The existing settings keep working as the Free values, so self-hosters are unaffected. The member cap per space is today the constant `MEMBERS_PER_SPACE = 10`; it becomes a function of the space owner's plan.

"Full history of everything shared" is on the Plus card in the draft pricing copy, but Free has no history limit today. My call: drop that line from the Plus card until a Free history limit is defined.

### Data
- `billing_accounts`: `user_id` (primary key, cascade), `stripe_customer_id` (unique), `plan` (`free` or `plus`), `status` (Stripe subscription status), `period_start`, `period_end`, `cancel_at_period_end`, `updated_at`.
- `credit_grants`: `id`, `user_id` (cascade), `kind` (`ai` or `email`), `amount`, `expires_at`, `stripe_event_id` (unique, so a repeated webhook cannot grant twice), `created_at`, `revoked_at` (set on refund).
- `stripe_events`: `id` (Stripe event id, primary key), `type`, `received_at`. Every webhook is recorded first and skipped if already seen.
- `ai_use_ledger` gains a nullable `grant_id`. A use paid from a pack carries the pack's id, and its refund copies it.
- Instant email counts become persistent: a table of sends in the last 24 hours (replacing the in-memory counter) plus the same grant-spend mechanism for email packs. The exact table shape is the builder's call.
- Deleting an account cancels the Stripe subscription and removes the Stripe customer, then deletes these rows.

### Spending
- AI: monthly allowance first (uses with no `grant_id` in the current period). When it is used up, spend from the grant that expires soonest and still has credits. If neither has anything left, return `402 ai_uses_exhausted`. The row lock on the user keeps this atomic.
- A paid person's period follows the subscription (`period_start` to `period_end`); a Free person's still follows their signup day.
- Email: if the daily count is under the plan's cap, send instantly. Otherwise spend one email credit if any, else fold into the morning summary exactly as today. Nothing is lost.

### Stripe flow
- Config: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and price ids `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_AI_PACK`, `STRIPE_PRICE_EMAIL_PACK`. Billing is on only when the key, the secret and the price ids are all set.
- `POST /api/billing/checkout` takes a product (`plus_monthly`, `plus_yearly`, `ai_pack`, `email_pack`), creates a Checkout Session for the signed-in person (creating the Stripe customer on first use) and returns its URL. The person's Orbit id goes in the session metadata and `client_reference_id`.
- `POST /api/billing/portal` returns a Customer Portal URL for managing the subscription and payment method.
- `POST /api/billing/webhook` (no sign-in; authenticated by Stripe's signature) handles `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` and `charge.refunded`. Plan state comes only from subscription events. Pack grants come only from `checkout.session.completed` with payment status paid.
- A refunded pack revokes whatever is left of that grant (my call). A cancelled or unpaid subscription drops the person back to Free at the end of the paid period; spaces over the Free member cap keep their members but cannot add more.
- The webhook route is exempt from the same-origin check (like OAuth) and from the 256 KB body cap only if Stripe's payloads need more.

### Web
- A **Billing** card in Settings, shown only when billing is on: current plan and renewal date, AI uses and email use left this period, a button to upgrade or manage, and buttons to buy an AI pack or an email pack. Buy buttons go to Stripe and come back to Settings with a short confirmation.
- Where someone runs out of AI uses, the existing note offers "Buy more or upgrade" instead of "coming soon" when billing is on.
- Landing page pricing: Plus becomes "Get Plus" (signs in, then goes to Settings), Team stays "Coming soon", and AI and email packs are listed as add-ons. When billing is off, the cards stay as they are now.

### Legal
Terms, privacy and data policy need a short payments section: Stripe is a processor, what Orbit stores (customer id, plan, dates, never card data), refunds, and cancellation. Sales tax and VAT are the seller's responsibility. Stripe Tax can calculate them, but registration is outside this project.

## Constraints
- Test mode first. The test keys come from the owner; live keys are added at launch by the owner.
- Orbit has no Stripe SDK today; add the official `stripe` Python package.
- New code follows the repo's patterns: services in `orbit/services`, a router in `orbit/routes`, a migration plus a changelog line, and `.types.ts` files beside web components.
- Postgres and SQLite must both work (the test suite runs on both).

## Open items for the owner
- Prices for the email pack (placeholder: 500 emails for $3) and whether packs should be sold in one size only. The AI pack is $5 for 100 from the draft pricing copy.
- Plus entitlements in the table above, in particular 25 instant emails a day.
- The legal seller and the tax approach.

## Left to the builder
Exact table shapes for email sends, Checkout success and cancel return pages, how prices are displayed (config copy versus read from Stripe), and the webhook retry and logging details.
