# Free-tier Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap spaces created per user and instant update emails per person per day on cloud, folding extra email activity into the morning summary. Members-per-space stays at 10 (already enforced).

**Architecture:** Two new env-driven settings (default `0` = unlimited, so self-host is unchanged). `create_space` checks a created-spaces count. `Notifier.flush_due` checks a per-recipient rolling-24h limiter and moves denied batches to an overflow list that `flush_daily` summarises at 08:00 local time.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, pydantic-settings, pytest. Run from `api/`.

**Spec:** `docs/superpowers/specs/2026-11-23-free-tier-limits-design.md`

## Global Constraints

- Env vars: `ORBIT_MAX_CREATED_SPACES`, `ORBIT_MAX_UPDATE_EMAILS_PER_DAY`. Both `int`, `ge=0`, default `0` meaning no limit.
- Cloud values: 5 created spaces, 5 update emails per day. `MEMBERS_PER_SPACE = 10` and `SPACES_PER_USER = 50` do not change.
- Created count = spaces with `created_by == user` and `deleted_at IS NULL`, regardless of current membership.
- Sign-in, invite, invite-accepted and account emails are never subject to the email cap. The summary email is exempt.
- Update activity is folded, never dropped (except for deleted spaces/people, as today).
- Error text for the space cap: `You can create up to {n} spaces on the free plan.`
- Work on a new branch off `main` (current branch `fix/generic-fact-placeholder` has unrelated uncommitted web changes; do not commit those).

## Review Focus

- A creator who left their own space still has it counted (tests in Task 1).
- Cap `0` means unlimited for both settings (Tasks 1 and 3).
- A user whose frequency is `off` never gets an overflow summary (Task 3).
- Overflow for a user whose local time is before 08:00 waits until 08:00 (Task 3).
- Overflow activity for a space deleted before the summary is dropped quietly (Task 3).
- Counters reset on restart: accepted, documented in Task 4, no test.

---

### Task 1: Settings and created-spaces cap

**Files:**
- Modify: `api/orbit/config.py` (add two fields after `demo_mode`)
- Modify: `api/orbit/services/spaces.py` (add `count_created_spaces`, check in `create_space` before the existing `SPACES_PER_USER` check at line ~152)
- Test: `api/tests/test_config.py`, `api/tests/test_services_spaces.py`

**Interfaces:**
- Produces: `Settings.max_created_spaces: int`, `Settings.max_update_emails_per_day: int`; `count_created_spaces(db: Session, user_id: str) -> int` in `orbit.services.spaces`.

- [ ] **Step 1: Write failing tests**
  - `test_config.py::test_limit_settings_default_to_unlimited`: `make_settings()` has both fields `== 0`.
  - `test_config.py::test_limit_settings_read_env_names_and_reject_negatives`: `make_settings(max_created_spaces=5).max_created_spaces == 5`; `max_update_emails_per_day=-1` raises `ValidationError`.
  - `test_services_spaces.py::test_created_space_cap_blocks_the_next_space`: set `env.settings.max_created_spaces = 5`, create 5, sixth raises `LimitReached` with message `"You can create up to 5 spaces on the free plan."`.
  - `::test_created_cap_zero_is_unlimited`: default settings, create 6 spaces, no error.
  - `::test_deleted_space_frees_a_created_slot`: cap 2, create 2, set `deleted_at` on one (pattern from `test_deleted_spaces_do_not_count_toward_the_limit`), third create succeeds.
  - `::test_created_cap_counts_spaces_the_creator_left`: cap 1, create a space, remove creator's `SpaceMember` row, second create raises `LimitReached`.
  - `::test_joining_a_space_does_not_use_a_created_slot`: cap 1, alex creates, blake joins via `make.space(alex, "x", blake)`, blake can still create one space.

- [ ] **Step 2: Run to confirm failure**

Run: `pytest tests/test_config.py tests/test_services_spaces.py -q`
Expected: new tests FAIL (attribute / error missing).

- [ ] **Step 3: Implement**
  - `config.py`: `max_created_spaces: int = Field(default=0, ge=0, validation_alias="ORBIT_MAX_CREATED_SPACES")` and the same for `max_update_emails_per_day` / `ORBIT_MAX_UPDATE_EMAILS_PER_DAY`.
  - `spaces.py`: `count_created_spaces` as a `func.count()` over `Space` filtered as in Global Constraints. In `create_space`, `if env.settings.max_created_spaces and count_created_spaces(db, actor.user_id) >= env.settings.max_created_spaces: raise LimitReached(...)`.

- [ ] **Step 4: Run to confirm pass**

Run: `pytest tests/test_config.py tests/test_services_spaces.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit** `feat: cap spaces created per user (env-configurable)`

### Task 2: Stop offering "start another space" at the cap

**Files:**
- Modify: `api/orbit/render.py` (`spaces_actions`, caller at line ~161 and its callers), `api/orbit/mcp_server.py` (supplies the flag)
- Test: the existing render/MCP tests (`grep -l spaces_actions tests` and `grep -l "start another space" tests`)

**Interfaces:**
- Consumes: `count_created_spaces`, `Settings.max_created_spaces` (Task 1).
- Produces: `spaces_actions(spaces: Sequence[SpaceView], can_combine: bool, can_start_space: bool) -> list[str]`. "start another space" appears only when `can_start_space` is true.

- [ ] **Step 1: Write failing tests.** `test_spaces_actions_omits_start_another_space_when_capped` (call with `can_start_space=False`, assert the phrase is absent) and a MCP-level test: cap 1, user has created 1 space, the spaces listing text lacks "start another space". Update existing callers of `spaces_actions` in tests to pass the new argument.
- [ ] **Step 2: Run** `pytest -q -k "actions or whats_new or spaces"`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** Replace the `len(spaces) < SPACES_PER_USER` check with `can_start_space`. The MCP layer computes `can_start_space = len(spaces) < SPACES_PER_USER and (not cap or count_created_spaces(...) < cap)` and threads it through the render function that calls `spaces_actions`.
- [ ] **Step 4: Run** `pytest -q`. Expected: all PASS.
- [ ] **Step 5: Web check.** Read `web/components/spaces/new-space-dialog.tsx`; confirm an API `LimitReached` error message is shown to the user. If it is not, show it; add a case to `web/tests/unit/components/spaces/new-space-dialog.test.tsx`. Run `npm test -- new-space-dialog` in `web/`.
- [ ] **Step 6: Commit** `feat: hide start-another-space at the created cap`

### Task 3: Update-email cap with fold-in to the morning summary

**Files:**
- Modify: `api/orbit/services/notify.py` (`Notifier.__init__`, `pending_count`, `flush_due`, `flush_daily`)
- Test: `api/tests/test_notify_frequency.py` (reuse its `instant`, `choose`, `mail`, `space`, `at` helpers and fixtures)

**Interfaces:**
- Consumes: `Settings.max_update_emails_per_day` (Task 1), `RateLimiter` from `orbit.ratelimit`.
- Produces: `Notifier._limiter: RateLimiter` (built from the injected clock), `Notifier._overflow: dict[str, list[tuple[str, Activity]]]`. Limiter key `f"update-email:{user_id}"`, limit `(cap, timedelta(days=1))`. Read the cap from `self._settings` at flush time, so tests can set `env.settings.max_update_emails_per_day = 5` after construction.

- [ ] **Step 1: Write failing tests** (each uses an `instant`-frequency recipient, `force=True` flushes, a `FakeClock`):
  - `test_the_sixth_update_email_in_a_day_is_held_back`: cap 5. Blake gets 5 emails (alex shares 5 times, flushing after each), the sixth flush sends blake nothing, `env.notifier.pending_count > 0`.
  - `test_held_back_updates_arrive_in_the_next_morning_summary`: after the sixth is held, advance clock to 08:00 next day UTC, `flush_daily`, drain: blake receives one summary email whose text mentions the sixth share's title.
  - `test_the_cap_window_rolls_after_a_day`: after holding one, advance 24h+1m, a new share emails blake instantly again.
  - `test_cap_zero_means_unlimited`: default settings, 8 flushes, 8 emails.
  - `test_the_cap_is_per_person`: carol is unaffected when blake is capped.
  - `test_sign_in_and_invite_emails_ignore_the_cap`: blake at cap, `env.limiter`-guarded invite email and a magic-link request still enqueue (call the existing service entry points used in `test_rest_invites_connections.py` / `test_magic_links*`; assert a message is sent).
  - `test_people_who_chose_off_never_get_an_overflow_summary`: blake hits the cap, then switches to `off`; at 08:00 next day nothing is sent and `pending_count == 0` afterwards.
  - `test_overflow_waits_for_eight_in_the_persons_time_zone`: blake in `KOLKATA`, overflow at 02:00 UTC (07:30 IST), `flush_daily` at 02:30 UTC sends nothing, at 03:00 UTC sends the summary.
  - `test_overflow_for_a_deleted_space_is_dropped_quietly`: set `deleted_at` on the space before the summary; no email, no error, nothing left pending.
  - `test_the_summary_for_overflow_is_exempt_from_the_cap`: with the limiter full, the summary still sends.
- [ ] **Step 2: Run** `pytest tests/test_notify_frequency.py -q`. Expected: new tests FAIL.
- [ ] **Step 3: Implement in `flush_due`.** After `_build` returns a non-None message, if cap is truthy and `not self._limiter.allow(key, (cap, timedelta(days=1)))`, extend `self._overflow[user_id]` with `(space_id, activity)` for each activity in the batch under `self._lock`, and do not enqueue or count it as sent. Otherwise enqueue as today. `pending_count` adds overflow lengths.
- [ ] **Step 4: Implement in `flush_daily`.** Treat a user as waiting if present in `_daily` or `_overflow`. Today anyone whose `email_frequency != daily` is dropped from `_daily`; change so that for non-daily users only `_overflow` entries are kept and `_daily` entries (none expected) cleared, and `off` users have both cleared. For kept users merge `_daily` and `_overflow` entries, apply the existing cutoff split, and pass to `_build_daily`. Existing daily-user behaviour must be unchanged (existing tests stay green).
- [ ] **Step 5: Run** `pytest tests/test_notify.py tests/test_notify_frequency.py -q`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat: cap instant update emails per day and fold extras into the morning summary`

### Task 4: Docs, env example, changelog

**Files:**
- Modify: `.env.example`, `docs/self-hosting.md`, `docs/deploy-railway.md`, `CHANGELOG.md`; check `web/components/legal/*` and `README.md` for any stated limits (`grep -rn "50 spaces\|10 people\|per day" web/components/legal README.md`).

- [ ] **Step 1: Document** both variables in `.env.example` (commented, with `0` meaning unlimited) and in the two docs: what they cap, that the email cap applies to instant update emails only, that extras go to the morning summary, and that counters are in memory and reset on restart.
- [ ] **Step 2: Cloud deploy note** in `docs/deploy-railway.md`: set `ORBIT_MAX_CREATED_SPACES=5` and `ORBIT_MAX_UPDATE_EMAILS_PER_DAY=5`.
- [ ] **Step 3: Changelog** entry under Unreleased.
- [ ] **Step 4: Legal copy.** Update only if a statement about limits exists.
- [ ] **Step 5: Full verification:** `pytest -q` in `api/` and `npm test` in `web/`. Expected: all PASS.
- [ ] **Step 6: Commit** `docs: document free-tier limits`

---

## Self-review notes
- Spec coverage: created cap (T1), render hint (T2), email cap and fold-in (T3), docs and cloud values (T4). Members cap needs no task.
- Names consistent: `count_created_spaces`, `max_created_spaces`, `max_update_emails_per_day`, `_overflow`, `_limiter`.
- Deferred (spec non-goals): global email ceiling, persisted counters.
