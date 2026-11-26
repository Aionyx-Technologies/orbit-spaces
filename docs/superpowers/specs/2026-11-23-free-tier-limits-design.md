# Free-tier limits (cloud)

Status: approved by owner in conversation, 2026-11-23.

## Intent
Orbit's cloud version is free. Cap cost and abuse: spaces created per user, people per space, update emails per day. Self-hosters must not get these caps by surprise.

## Goals
- A user can create at most 5 spaces on cloud.
- A space holds at most 10 people (already true: `MEMBERS_PER_SPACE = 10`, enforced in `services/invites.py` on invite and accept).
- A person gets at most 5 *instant update emails* per rolling 24h. Extra activity is folded into the next morning summary (08:00 in the user's time zone), not dropped.

## Non-goals
- No global (all-users) email ceiling. Deferred; revisit against the email provider's free quota.
- No persistence of counters. The rate limiter is in memory and resets on restart (same as today's limits).
- No billing, plans or paid tier UI.

## Anti-goals
- Sign-in codes, invite emails, invite-accepted emails and account emails are never subject to the update-email cap. Capping them could lock a user out.
- Update activity is never silently lost.
- Self-host default behaviour must not change.

## Approaches considered
1. **Env-configurable limits, cloud sets the values (chosen).** New settings, defaults keep today's behaviour. Cloud deploy sets `ORBIT_MAX_CREATED_SPACES=5`, `ORBIT_MAX_UPDATE_EMAILS_PER_DAY=5`.
2. Hard-code new constants in `limits.py`. Simplest, but changes self-host behaviour and needs a fork or code change to turn off.
3. Plan/tier model in the database. Right for paid tiers later; far too much for three caps.

## Design

### Settings (`api/orbit/config.py`)
- `max_created_spaces: int`, env `ORBIT_MAX_CREATED_SPACES`, `ge=0`, default `0` = no limit.
- `max_update_emails_per_day: int`, env `ORBIT_MAX_UPDATE_EMAILS_PER_DAY`, `ge=0`, default `0` = no limit.
- Members cap stays the constant `MEMBERS_PER_SPACE = 10`. Joined-spaces cap stays `SPACES_PER_USER = 50` (my call: the "belong to" cap stays loose, so people invited into many spaces are not blocked).

### Created-spaces cap (`api/orbit/services/spaces.py`)
- New `count_created_spaces(db, user_id)`: spaces with `created_by == user_id` and `deleted_at IS NULL`, regardless of current membership (my call: stops leave-and-recreate churn). Deleting a space frees a slot.
- `create_space` raises `LimitReached` when the cap is set and reached. Message: "You can create up to {n} spaces on the free plan."
- Applies to REST, web and MCP, since all go through `create_space`.
- `render.py` `spaces_actions` must stop offering "start another space" when the created cap is reached (my call, builder decides how to get the count).

### Update-email cap (`api/orbit/services/notify.py`)
- `Notifier` gets its own `RateLimiter` (using the injected clock) and the cap value.
- In `flush_due`, after `_build` returns a message (not None), check `limiter.allow(f"update-email:{user_id}", (cap, 24h))`. Allowed: enqueue. Denied: move that batch of activities into a new `_overflow[user_id]` list of `(space_id, activity)`.
- `flush_daily` must also process `_overflow` users whose frequency is not `off`, even when their frequency is `instant`. Today it drops anyone not on `daily`; change so overflow users are summarised at 08:00 local like daily users. The summary email itself is exempt from the cap (my call: worst case is 5 instant + 1 summary per day).
- `pending_count` includes overflow.
- Cap `0` skips the check entirely.

### Messages and docs
- Web: confirm the new-space dialog shows the `LimitReached` text (see `web/tests/unit/components/spaces/new-space-dialog.test.tsx`). Hide or disable "new space" when the API says the cap is reached only if cheap; otherwise rely on the error.
- `.env.example`, `docs/self-hosting.md`, `docs/deploy-railway.md`: document both variables.
- `CHANGELOG.md`: add an entry.
- Check legal copy (`web/components/legal/*`) for any statement about limits; update only if one exists.

## Tests (TDD)
- `test_services_spaces.py`: cap reached raises; deleted space frees a slot; cap 0 is unlimited; other users unaffected.
- `test_notify*`: 5 instant emails sent, 6th folded; folded activity appears in next morning summary for an `instant` user; window rolls after 24h; cap 0 unlimited; sign-in and invite emails unaffected.
- `test_config.py`: defaults and validation of the new settings.

## Left to the builder
Exact wording of messages, how `render.py` learns the created count, test file names, and whether the web UI hides the button.
