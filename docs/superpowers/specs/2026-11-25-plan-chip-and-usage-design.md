# Plan chip and usage in the header

Status: approach A chosen by the owner on 2026-11-25. Short design for a small change.

## Intent
After testing paid plans, the owner found three problems: the upgrade path is buried at the bottom of Settings, nothing outside Settings shows that someone is on Plus, and nobody can see their usage. The Billing card even says "what you have left" while showing no usage (a regression from the Task 10 review, which removed the AI-uses line because it went stale after a purchase).

## Goals
- Every signed-in page shows the person's plan and lets them reach usage, buying and managing in one click.
- Usage is visible: AI uses used and left this period, instant emails used in the last 24 hours (when capped), pack credits left.
- After Stripe checkout the person lands back where they started, and the header already shows the new plan.
- Billing sits near the top of Settings, with the same usage.

## Non-goals
- A dedicated Plan page, replacing the avatar link with an account menu, usage history charts, per-space usage.
- Showing the chip on servers where billing is off (self-hosted without Stripe see no change).
- Team plan.

## Anti-goals
- A stale number presented as current (the reason AI uses were dropped from the card). Usage must come from live data, not only server props.
- Moving or changing what the avatar does today (it stays a direct link to Settings).
- A post-checkout message or refresh that runs twice because two components both read `?billing=`.

## Approaches
1. **Plan chip + popover beside the avatar, Billing card moved up (chosen).** One component on every page covers all three complaints; nothing existing changes.
2. Avatar becomes an account menu. Tidier, but Settings takes an extra click and it changes an existing control.
3. A dedicated "Plan" page in the main nav. Most visible, most work, and it duplicates Settings.

## Design (the calls below are mine; the owner chose only the approach)

### API
- `GET /api/me` gains `instant_emails: {limit, used, remaining} | null` (`null` when the person has no daily cap: Free on a server with the cap at 0, or Plus on such a server). `used` counts sends in the last 24 hours that no pack paid for (the same count `email_allowance` uses against the cap); `remaining` is never below 0. No query runs when there is no cap.
- `POST /api/billing/checkout` accepts an optional `return_to` path. It is used only if it is a relative path starting with a single `/`, with no scheme, host, `//` or backslash, and its first segment is one of `spaces`, `assistants`, `settings`. Anything else falls back to `/settings`. The success and cancel URLs become `{base_url}{return_to}?billing=success|cancelled`, keeping any existing query by appending with `&`. The portal return URL stays `{base_url}/settings`.

### Header chip (web)
- New client component `PlanChip` in the header, between the theme switcher and the avatar. It renders only when `me.billing_enabled`.
- Label: Free shows "Free" with an upgrade accent; Plus shows "Plus". Keyboard accessible, opens a popover (add `components/ui/popover.tsx` from the already-installed `radix-ui` package).
- Popover content: plan name and, for Plus, "Renews on <date>" or "Ends on <date>" (Plus only); a usage row per meter with a small bar: AI uses (`used of limit` this period, with the reset date; hidden when the limit is null), instant emails today (hidden when `instant_emails` is null), and pack credits left when above zero; buttons: "Upgrade to Plus" (monthly and yearly, Free only), "Buy 100 AI uses" and "Buy 500 emails" (respecting `ai_pack_available`/`email_pack_available`), "Manage subscription" (when `can_manage`), and a link "Billing in Settings".
- Data: the header receives the server-rendered `me` as the initial value and the popover revalidates `/api/me` and `/api/billing` when it opens, so numbers are never older than the last open.
- The buy and manage actions reuse the existing checkout and portal calls and pass `return_to` as the current path.

### Return from Stripe
- The `?billing=success|cancelled` handling (one-time message, polling at about 3, 8 and 15 seconds, cleaning the query, `pageshow` reset) moves out of `BillingSection` into one shared hook mounted once, in `PlanChip`, so it works on any page and runs once. `BillingSection` keeps reading billing data through SWR and benefits from the same revalidation.
- Messages show as a toast (sonner is already used) instead of inline text.

### Settings
- `BillingSection` moves directly under Profile and shows the same usage meters (reusing one shared `UsageMeters` component with the popover), plus the buttons it has today.

### Tests
- API: `instant_emails` shape, null with no cap, counts only plan-paid sends in 24 hours; `return_to` validation (accepts allowed paths, rejects `//evil.com`, `https://…`, `/\evil`, unknown first segments, falls back to `/settings`), query appending.
- Web: chip hidden when billing is off; Free/Plus labels; popover meters and hidden meters; buy buttons post `return_to` and navigate to the server's URL only; success handling runs once from the header and not from the Billing card; Settings order.

## Left to the builder
Exact visual treatment of the chip and bars, the popover's responsive layout on phones, and the toast wording.
