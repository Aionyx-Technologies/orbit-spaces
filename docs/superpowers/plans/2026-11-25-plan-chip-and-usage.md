# Plan chip and usage in the header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a person's plan and usage on every page through a header chip with a popover, return them to the page they started from after Stripe checkout, and move Billing near the top of Settings with the same usage.

**Architecture:** Two small API additions (`instant_emails` on `/api/me`, `return_to` on checkout). On the web, two shared pieces (`UsageMeters`, `BillingActions`) are used by both the new `PlanChip` popover and the Billing card, and the `?billing=` return handling moves out of the card into one hook mounted by the chip. Usage numbers are read live (SWR) with the server-rendered `me` only as the first value.

**Tech Stack:** FastAPI, SQLAlchemy, pytest; Next.js, SWR, radix-ui (already installed), sonner, vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-plan-chip-and-usage-design.md`. Builds on the paid-plans work on branch `feat/paid-plans` (PR #49): `web/components/settings/billing-section.tsx`, `api/orbit/routes/billing.py`, `api/orbit/services/email_allowance.py`.

## Global Constraints

- The chip, popover and `instant_emails` appear only when `me.billing_enabled`; with billing off nothing new renders and no extra request is made.
- Success and cancel URLs: `{base_url}{return_to}?billing=success|cancelled` (use `&` when `return_to` already has a query). `return_to` is used only if it is a relative path starting with a single `/`, with no scheme, host, `//` or backslash, whose first segment is `spaces`, `assistants` or `settings`; anything else falls back to `/settings`. The portal return URL stays `{base_url}/settings`.
- `instant_emails` is `null` when the person has no daily cap; otherwise `{limit, used, remaining}`, `used` counting only sends in the last 24 hours that no pack paid for, `remaining` never below 0. No query runs when there is no cap.
- The avatar stays a direct link to Settings. The `?billing=` message, polling at 3, 8 and 15 seconds, query cleaning and `pageshow` reset run exactly once per return (not from both chip and card).
- Meters: AI uses hidden when `ai_uses.limit` is null; instant emails hidden when `instant_emails` is null; pack credit lines only when above zero. Renewal/end line only on Plus.
- Web conventions: a `.types.ts` beside each component with props; shadcn-style primitives; `navigateTo` from `lib/navigation.ts` for leaving to Stripe (server-provided URL only); prettier, `eslint --max-warnings 0`, `npm run typecheck` clean.
- Tooling on this machine: the full vitest run is extremely slow (workers time out on startup); run only touched files with `cd web && timeout 280 node scripts/vitest.mjs run <files>` and re-run on a startup timeout. API: from `api`, `.venv/Scripts/python.exe -m pytest <files> -q -p no:cacheprovider`; ruff check, ruff format --check, `mypy orbit` clean; run the full API suite once at the end of Task 1.
- Git: the working tree has the owner's unrelated uncommitted files (`README.md`, `.github/*`, `brand/`, several `web/components/legal/*` and `web/tests/unit/components/legal/*`). Commit only your own files with explicit `git add <paths>`, never `-A`. After each commit run `git show --stat HEAD` and confirm every file you claim is in it. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No network call with a DB transaction open.

## Review Focus

- `return_to` open redirects: `//evil.com`, `https://evil.com`, `/\evil.com`, `/settings@evil.com`, empty string, over-long input all fall back to `/settings` (Task 1).
- `return_to` that already has a query (`/spaces?tab=shared`) gets `&billing=success`, not a second `?` (Task 1).
- A Plus person on a server with no email cap, and a Free person with the AI limit off: meters hide instead of showing `0 of null` (Tasks 2, 3).
- The billing request fails when the popover opens: an error shows, the chip still works, and no buy buttons render without data (Task 3).
- Returning from Stripe onto a page that also mounts the Billing card (Settings): one toast, one polling run, no inline message in the card (Tasks 3, 4).

---

### Task 1: API: `instant_emails` on `/me` and `return_to` on checkout

**Files:**
- Modify: `api/orbit/services/email_allowance.py`, `api/orbit/schemas.py`, `api/orbit/routes/me.py`, `api/orbit/routes/billing.py`
- Test: `api/tests/test_email_allowance.py`, `api/tests/test_rest_billing.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class EmailUsage: limit: int; used: int; remaining: int`; `def usage(db: Session, settings: Settings, user_id: str, now: datetime) -> EmailUsage | None` in `email_allowance.py` (None when `billing_state.entitlements_for(...).instant_emails_per_day` is None; otherwise counts with the existing `_sent_unpaid`); `class EmailUsesOut(BaseModel): limit: int; used: int; remaining: int` and `MeOut.instant_emails: EmailUsesOut | None = None`; `CheckoutIn.return_to: str | None = Field(default=None, max_length=300)`; `def checkout_return_path(raw: str | None) -> str` in `routes/billing.py` returning the validated path (or `"/settings"`) with any `#fragment` dropped.
- Consumes: `billing_state.entitlements_for`, `email_allowance._sent_unpaid`, the existing `FakeBilling.checkouts` records in `tests/billing_helpers.py` (they keep `success_url` and `cancel_url`).

- [ ] **Step 1: Write failing tests.** In `test_email_allowance.py`: `test_usage_is_none_without_a_daily_cap`, `test_usage_counts_only_plan_paid_sends_in_the_last_day` (limit 5, record 3 plan-paid, 1 pack-paid, 1 older than 24 hours: `used == 3`, `remaining == 2`), `test_usage_remaining_never_goes_below_zero`, `test_a_plus_person_sees_the_plus_limit`. In `test_rest_billing.py`: `test_me_reports_instant_emails_usage` (cap 5 on the server, `GET /api/me` returns `{"limit":5,"used":0,"remaining":5}`; with cap 0 it is null), parametrized `test_checkout_return_to_is_validated` over valid `/spaces`, `/spaces?tab=shared`, `/settings`, `/assistants` and invalid `//evil.com`, `https://evil.com`, `/\evil.com`, `/settings@evil.com`, `""`, `"/" + "a"*400` (the last returns 422 from the length limit; the others fall back to `/settings`), and `test_return_to_query_is_appended_with_an_ampersand` asserting the gateway got `{base}/spaces?tab=shared&billing=success` and the cancel URL `...&billing=cancelled`.
- [ ] **Step 2: Run** `pytest tests/test_email_allowance.py tests/test_rest_billing.py -q -p no:cacheprovider`. Expected: FAIL (no `usage`, field missing).
- [ ] **Step 3: Implement** the signatures above. `checkout_return_path` uses `urllib.parse.urlsplit`: reject any scheme or netloc, require the raw string to start with exactly one `/`, reject `\\` and control characters, take the first path segment and check it against `{"spaces","assistants","settings"}`. In `start_checkout` build `success_url`/`cancel_url` from the validated path, choosing `&` when it contains `?`. In `me_out` call `email_allowance.usage(db, runtime.settings, user.id, runtime.env.now())` and map it to `EmailUsesOut`.
- [ ] **Step 4: Run** the step 2 command, then the full API suite (`pytest -q -p no:cacheprovider`, several minutes, foreground), ruff check, ruff format --check, `mypy orbit`. Expected: all pass and clean.
- [ ] **Step 5: Commit** `git add` the five source/test files; message "Report instant email usage and let checkout return to the starting page".

---

### Task 2: Web: shared usage meters and billing actions

**Files:**
- Create: `web/components/billing/usage-meters.tsx`, `usage-meters.types.ts`, `billing-actions.tsx`, `billing-actions.types.ts`
- Modify: `web/lib/api.types.ts`, `web/lib/api.ts`, `web/lib/queries.ts`, `web/lib/format.ts`, `web/components/settings/billing-section.tsx`, `web/tests/unit/helpers/fixtures.ts`
- Test: `web/tests/unit/components/billing/usage-meters.test.tsx`, `web/tests/unit/components/billing/billing-actions.test.tsx`; existing `web/tests/unit/components/settings/billing-section.test.tsx` must keep passing

**Interfaces:**
- Produces: `EmailUses = { limit: number; used: number; remaining: number }` and `Me.instant_emails: EmailUses | null` (`makeMe` default `null`); `api.billing.checkout(product: BillingProduct, returnTo?: string)` posting `{ product, return_to }` (omit `return_to` when undefined); `PlanSummary = Pick<Me, "plan" | "billing_enabled" | "ai_uses" | "instant_emails">` and `function useLiveMe(initial: PlanSummary): PlanSummary` in `queries.ts` (SWR on `ME_KEY`, returns `data ?? initial`, enabled only when `initial.billing_enabled`; also exposes nothing else); `formatDay(iso: string): string` in `lib/format.ts` (the `formatDate` now private in `billing-section.tsx`, UTC "Dec 26, 2026" style); `UsageMeters({ aiUses, instantEmails, aiPackCredits, emailPackCredits }: UsageMetersProps)` with `UsageMetersProps = Readonly<{ aiUses: AiUses; instantEmails: EmailUses | null; aiPackCredits?: number; emailPackCredits?: number }>`; `BillingActions({ billing, returnTo }: BillingActionsProps)` with `BillingActionsProps = Readonly<{ billing: Billing; returnTo?: string }>`.
- Consumes: Task 1's `instant_emails` field and `return_to` parameter; existing `Billing`, `BillingProduct`, `AiUses`, `navigateTo`, `describeError`, `redirectIfUnauthenticated`, `ErrorNotice`.

- [ ] **Step 1: Write failing tests.** `usage-meters.test.tsx`: `shows AI uses left and the reset date` ("112 of 150 AI uses left", a `role="progressbar"` with `aria-valuenow` 38 of `aria-valuemax` 150 named "AI uses used"), `shows instant emails used today`, `hides AI uses when the limit is null`, `hides emails when instantEmails is null`, `shows pack credits only above zero`. `billing-actions.test.tsx` (move the equivalent assertions from the billing-section tests, same mock-fetch and `navigateTo` mock pattern): `posts each product and navigates to the server url`, `passes return_to when given and omits it otherwise`, `shows Manage subscription only with a billing account`, `hides pack buttons by the availability flags`, `shows an error and re-enables the buttons when checkout fails`, `resets the pending state on pageshow persisted`.
- [ ] **Step 2: Run** `cd web && timeout 280 node scripts/vitest.mjs run tests/unit/components/billing`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** `BillingActions` takes over from `BillingSection`: the buttons block, the "yearly plan is 2 months free" line, `pending` and `error` state, `leaveFor`, the `pageshow` listener, and its own `ErrorNotice`. `UsageMeters` renders a list with a bar per capped meter (`role="progressbar"`, accessible name, values) and text per the Global Constraints. Replace the corresponding markup in `BillingSection` with `<BillingActions billing={billing} />` (no behaviour change yet). Add the types, `api.billing.checkout` parameter, `useLiveMe`, `formatDay` (and use it in `billing-section.tsx`), and the `makeMe` fixture field.
- [ ] **Step 4: Run** `cd web && timeout 280 node scripts/vitest.mjs run tests/unit/components/billing tests/unit/components/settings/billing-section.test.tsx`, then `npm run typecheck`, `npx eslint <changed files> --max-warnings 0`, `npx prettier --write <changed files>`. Expected: PASS and clean (the existing billing-section tests still pass, proving the extraction changed nothing).
- [ ] **Step 5: Commit** the changed files; message "Share usage meters and billing actions between the card and the header".

---

### Task 3: Web: plan chip, popover and one return handler

**Files:**
- Create: `web/components/ui/popover.tsx` (thin wrapper over `Popover` from `radix-ui`, same styling conventions as `dropdown-menu.tsx`), `web/components/layout/plan-chip.tsx`, `plan-chip.types.ts`, `web/lib/use-billing-return.ts`
- Modify: `web/components/layout/app-header.tsx`, `app-header.types.ts`, `web/components/settings/billing-section.tsx`
- Test: `web/tests/unit/components/layout/plan-chip.test.tsx`, `web/tests/unit/lib/use-billing-return.test.tsx`; update `web/tests/unit/components/settings/billing-section.test.tsx` and any `app-header` test

**Interfaces:**
- Produces: `PlanChip({ me }: PlanChipProps)` with `PlanChipProps = Readonly<{ me: PlanSummary }>`, rendering `null` unless `me.billing_enabled`; `useBillingReturn(enabled: boolean): void` in `lib/use-billing-return.ts`; `AppHeaderProps.me` gains optional `plan`, `billing_enabled`, `ai_uses`, `instant_emails` (so callers that lack them still typecheck and render no chip).
- Consumes: Task 2's `useLiveMe`, `UsageMeters`, `BillingActions`, `formatDay`, `useBilling`; `currentPath()` from `lib/navigation.ts`; `toast` from `sonner` (confirm the `Toaster` is mounted in the app layout; mount it if it is not).

- [ ] **Step 1: Write failing tests.** `plan-chip.test.tsx`: `renders nothing when billing is off`, `labels a Free person Free with an upgrade cue and a Plus person Plus`, `opens a popover with usage meters and the Plus renewal line only for Plus`, `shows buy and upgrade buttons from the billing data and passes the current path as return_to`, `shows an error and no buy buttons when billing fails to load` (the chip still opens), `revalidates me and billing when opened` (assert the second fetch), `keeps the avatar a direct link to Settings` (render `AppHeader`). `use-billing-return.test.tsx` (fake timers): `shows a success toast once and cleans the query`, `shows the cancelled toast`, `polls me and billing at 3, 8 and 15 seconds and stops early when the plan or pack credits change`, `stops polling on unmount`, `does nothing without the query or when disabled`. In `billing-section.test.tsx`: `does not show or handle the billing return message itself` (render with `?billing=success`: no inline status, no polling fetches).
- [ ] **Step 2: Run** `cd web && timeout 280 node scripts/vitest.mjs run tests/unit/components/layout/plan-chip.test.tsx tests/unit/lib/use-billing-return.test.tsx tests/unit/components/settings/billing-section.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Move `readNotice`, the notice effect, the polling effect, `REFRESHES_AFTER_CHECKOUT_MS`, `NOTICES` and `purchaseKey` out of `billing-section.tsx` into `use-billing-return.ts`; on `success` take a baseline with one billing fetch, then poll at 3000, 8000 and 15000 ms revalidating `ME_KEY` and `BILLING_KEY` through `useSWRConfig().mutate`, stopping early when `purchaseKey` changes, with timers cleared on unmount; messages become `toast.success("Thanks, your purchase is being processed. It can take a moment to show up.")` and `toast("Checkout cancelled. You have not been charged.")`. `PlanChip` calls `useBillingReturn(me.billing_enabled)`, `useLiveMe(me)`, and `useBilling(open && me.billing_enabled)`; on open it calls the two `mutate`s; the popover shows `UsageMeters` (with pack credits from `billing`), the Plus renewal/end line (Plus only), `BillingActions` with `returnTo={currentPath()}` once `billing` has loaded, an `ErrorNotice` on load failure, and a link "Billing in Settings" to `/settings`. Render `PlanChip` in `AppHeader` between `ThemeSwitcher` and `SettingsLink`, passing `me`.
- [ ] **Step 4: Run** the step 2 command plus `tests/unit/components/layout` and `tests/unit/components/settings`, then typecheck, eslint and prettier on changed files. Expected: PASS and clean.
- [ ] **Step 5: Commit** the changed files; message "Show the plan and usage in the header and handle the Stripe return once".

---

### Task 4: Web: Billing near the top of Settings with usage; changelog

**Files:**
- Modify: `web/components/settings/settings-screen.tsx`, `web/components/settings/billing-section.tsx`, `CHANGELOG.md`
- Test: `web/tests/unit/components/settings/settings-screen.test.tsx`, `web/tests/unit/components/settings/billing-section.test.tsx`

**Interfaces:**
- Consumes: Task 2's `UsageMeters`, `useLiveMe`; Task 3's removal of return handling from the card.

- [ ] **Step 1: Write failing tests.** `settings-screen.test.tsx`: `puts Billing directly under Profile` (document order: Profile, Billing, Notifications). `billing-section.test.tsx`: `shows the same usage meters as the header, from live data` (the `/api/me` response differs from the server prop and the card shows the fetched values), `says what you have left only because it now shows it` (description text asserts the meters are present).
- [ ] **Step 2: Run** `cd web && timeout 280 node scripts/vitest.mjs run tests/unit/components/settings/settings-screen.test.tsx tests/unit/components/settings/billing-section.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `settings-screen.tsx` render `<BillingSection me={me} />` immediately after `<ProfileSection me={me} />`. In `billing-section.tsx` render `UsageMeters` from `useLiveMe(me)` plus the pack credits above the actions, and keep the description "Your plan and what you have left. Plus is $6 a month or $60 a year." (now true). Add `CHANGELOG.md` entries under Added or Changed (Unreleased): the header plan chip and usage popover, `instant_emails` on `/api/me`, `return_to` on checkout, Billing moved up in Settings with usage; mention that the Billing card no longer shows an inline return message.
- [ ] **Step 4: Run** the step 2 command, then `cd web && timeout 280 node scripts/vitest.mjs run tests/unit/components/billing tests/unit/components/layout tests/unit/components/settings`, typecheck, eslint and prettier on changed files. Expected: PASS and clean.
- [ ] **Step 5: Commit** the changed files; message "Put Billing under Profile and show usage there".
