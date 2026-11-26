# Spec: move Orbit's database from SQLite to Railway Postgres

Status: draft, 2026-11-22. Written from a read of `api/orbit/db.py`, `backup.py`, `models.py`, `alembic/env.py`, `docker-compose.yml` and `docs/deploy-railway.md`. Railway facts come from its docs and community threads (backups guide, PITR docs, private-networking threads), not from running it. Confirm plan features and prices on Railway's pricing page before you commit.

## 1. Why, and why not

Today: one api process, SQLite in WAL mode on a volume at `/data`, nightly gzip snapshot to S3.

Reasons to move:
- The database leaves the api's volume, so an api redeploy no longer waits on a volume handover (the Railway doc says the api is down while it redeploys).
- Native backups and point-in-time recovery (PITR), which need the Pro plan according to Railway staff and docs.
- A path to more than one api instance later.

Reasons to wait:
- A private launch with a handful of testers fits SQLite fine.
- Live updates (`events`) and rate limits are in memory, so the api stays single-instance regardless of the database.
- Community threads report private-network latency from 5ms to about 170ms on Railway, with no cause found. Orbit makes several queries per request, so measure first (section 4).

Why Railway Postgres rather than Supabase: same project and private network, no public database endpoint, no extra vendor on the privacy page, and PITR billed as storage and egress only. Supabase would add a public endpoint, IPv6/pooler setup, RLS lockdown and a new processor. Supabase's PITR add-on costs far more.

**Scope rule:** plain Postgres only. Orbit keeps its own magic-link auth, OAuth server and SSE stream.

## 2. What already helps

- SQLAlchemy 2.x everywhere, driven by `DATABASE_URL`.
- `create_db_engine` already has a non-SQLite branch (`pool_pre_ping`).
- Alembic migrations (`0001`, `0002`), naming convention set, `UTCDateTime` stores aware UTC.
- Only 5 files catch `IntegrityError` or use `rows_affected`: `auth/magic_links.py`, `auth/sessions.py`, `oauth/provider.py`, `services/invites.py`, `db.py`.

## 3. SQLite-specific code to change

| Where | Problem | Change |
|---|---|---|
| `api/pyproject.toml` | No Postgres driver | Add `psycopg[binary]>=3.2,<4`. URL form `postgresql+psycopg://...` |
| `db.py` `_configure_sqlite` | PRAGMAs, `BEGIN IMMEDIATE`/`DEFERRED`, `sqlite_begin` option | Already gated by `is_sqlite`. Keep. On Postgres the read factory uses a normal session (the option is ignored). |
| `models.py:254` | Partial index | Already has both `sqlite_where` and `postgresql_where`. Verified by a test on both backends. No change needed. |
| `db.py` writers | `BEGIN IMMEDIATE` serialised every writer, which hid races | Audit (section 6) |
| `backup.py` | `snapshot_sqlite` and `BackupError` for non-SQLite | Section 8 |
| `models.py` JSON columns | SQLite stores text, Postgres `json` | Fine. Nothing queries inside them. |
| `models.py` `server_default="0"` / `sa.true()` | Boolean and int defaults | Re-check the generated Postgres DDL (section 5) |
| `alembic/env.py` | `render_as_batch=True` | Harmless on Postgres. Leave it. |
| `Dockerfile`, `docker-compose.yml` | `DATABASE_URL` default is SQLite on a volume | Keep SQLite as the default for self-hosters. Postgres is opt-in through `DATABASE_URL`. |
| `docs/deploy-railway.md`, `docs/self-hosting.md` | Say "leave `DATABASE_URL` unset" and describe the volume | Document both paths (section 11) |
| Tests | Fixtures build SQLite databases | Section 7 |

Keep SQLite working. The project is open source and `docs/self-hosting.md` promises a simple setup, so Postgres must not become mandatory.

## 4. Railway setup and connection

1. **Check the environment first.** Environments created before 16 Oct 2025 use IPv6-only private networking, and the images listen on IPv4 (your Railway doc already warns about this). If yours is old, create a new environment. Confirm the Postgres service resolves and connects from the api.
2. **Plan:** Pro, for backups and PITR. The Hobby plan has no native volume backups according to a Railway staff reply.
3. **Add the Postgres service** from Railway's template in the same project and region as the api. Name it `postgres`. Railway sets `DATABASE_URL` and `DATABASE_PUBLIC_URL` on it.
4. **Wire the api** with a reference variable: `DATABASE_URL=postgresql+psycopg://${{postgres.PGUSER}}:${{postgres.PGPASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}`. Use the private domain, not the public proxy. The public TCP proxy adds latency and egress cost and exposes the database.
5. **Measure before committing.** From the api container, time TCP connect and a `SELECT 1` on a warm connection, 50 samples. Targets: p50 under 5ms, p95 under 20ms. If you see 100ms or more, stop and test another region or environment before migrating.
6. Engine settings for Postgres: `pool_size` 5, `max_overflow` 5, `pool_recycle` 1800, `pool_pre_ping=True` (already). One api instance, so no pooler such as PgBouncer is needed.
7. `DATABASE_URL` is a secret. Never commit it. `hide_parameters=True` is already set. Check `observability.py` and Sentry scrubbing do not log it.
8. TLS is not needed on the private network. If you ever use the public URL (for example for a one-off restore from your laptop), add `?sslmode=require`.
9. Do not enable a public domain or TCP proxy for the Postgres service unless you need it, and remove it afterwards.

## 5. Schema creation

- Do not hand-write DDL. Point `DATABASE_URL` at the empty Railway database and run `alembic upgrade head`. Then run `alembic revision --autogenerate`; it should produce an empty migration.
- Inspect by eye: boolean defaults, `LargeBinary` becoming `bytea`, `String(n)` lengths, the partial unique index on `memory`, FK `ON DELETE` rules, and the `items(space_id, created_at)` index.
- Check email lookups for case sensitivity. If emails are not always lowercased in code, add a unique index on `lower(email)`.

## 6. Concurrency audit (the real risk)

SQLite with `BEGIN IMMEDIATE` allows one writer at a time. Postgres defaults to READ COMMITTED with many concurrent writers. Code that reads, decides, then writes can now race.

Review each of these for check-then-act patterns and fix with a conditional `UPDATE ... WHERE` (preferred, already the `rows_affected` style), `SELECT ... FOR UPDATE`, or a unique constraint plus catching `IntegrityError`:

- Magic link and sign-in code consumption, including `code_attempts` (`auth/magic_links.py`)
- Session create and revoke (`auth/sessions.py`)
- OAuth code exchange and refresh-token rotation (`oauth/provider.py`). Single use must hold under concurrent requests.
- Invite accept, including "accepted_by" set once (`services/invites.py`)
- Memory supersede (`superseded_at`): two concurrent sets of one key
- Waitlist and default-space creation
- Any `except OperationalError` that handles "database is locked". The Postgres equivalents are deadlock and serialization failures; add a bounded retry only where needed.

Add a test per claim path that runs two threads against Postgres.

## 7. Tests and CI

- Add `TEST_DATABASE_URL`. The default stays SQLite so local runs stay fast.
- `tests/test_db.py`, `test_migrations.py`, `sql_helpers.py` and `conftest.py` need a Postgres fixture: create a schema per test run, `alembic upgrade head`, truncate between tests.
- Add a CI job in `.github/workflows/ci.yml` that runs the suite against a `postgres:16` service container. Keep the SQLite job.
- `test_backup.py` and `test_e2e_server.py` need SQLite-only markers or Postgres variants.
- Gate: the full suite passes on both backends before any data moves.

## 8. Backups

Two layers. Railway's native backups are the first. Your own copy outside Railway is the second, which your design asks for and which survives the loss of the whole Railway project.

**Railway native (Pro):**
- Turn on scheduled backups for the Postgres volume. Retention per the docs: daily copies for 6 days, weekly for 1 month, monthly for 3 months.
- Turn on PITR. Window is about 4 weeks, newest restorable point trails real time by about a minute. Cost is bucket storage and egress.
- Watch the volume size. Community threads report PITR restores filling a small volume and on-demand backups failing near the limit. Size the volume with headroom (suggest 3 times the data).

**Off-Railway copy:**
- Add `pg_dump` support to `backup.py`: when the URL backend is `postgresql`, run `pg_dump --format=custom` into a temp file, upload to the same S3 key scheme (`orbit-YYYYMMDD.dump`), reuse `prune`. The api image needs `postgresql-client` matching the server's major version.
- Until that exists, make `run_backup` fail with a clear message on Postgres instead of the current SQLite error.
- Keep `BACKUP_*` and `AWS_*` variables as they are.

**Restore drill, before launch:** restore a Railway backup into a scratch service, and restore one `pg_dump` file into a local Postgres. Time both. A backup you have not restored is not a backup.

## 9. Security and legal

- The database stays on the private network. Do not expose the TCP proxy or public domain.
- Give Orbit its own database role instead of the superuser, owning only its tables. Keep the superuser password for admin tasks only.
- Postgres on Railway is the same provider that already hosts Orbit, so it adds no new processor. Check that `ORBIT_DATA_LOCATION` and the privacy page still describe reality (database now in a Railway Postgres service, same region). The legal copy lives on `feat/launch-legal`; keep it in step with the switch.
- No Supabase-style RLS lockdown is needed because nothing exposes the tables.

## 10. Data migration (SQLite to Postgres)

Write `api/scripts/sqlite_to_postgres.py` (or `python -m orbit.migrate_db`). Behaviour:

1. Refuse to run unless the target is empty and at Alembic `head`.
2. Open the SQLite file read-only. Open Postgres in one transaction.
3. Copy tables in foreign-key order from `Base.metadata.sorted_tables`, not a hard-coded list. Current tables: `users`, `user_avatars`, `oauth_clients`, `spaces`, `space_members`, `invites`, `items`, `memory`, `magic_links`, `web_sessions`, `oauth_codes`, `oauth_tokens`, `waitlist`, plus anything added after `0002`.
4. Use SQLAlchemy Core with the models' types so `UTCDateTime`, JSON and booleans convert correctly. Insert in batches of 1,000.
5. Verify: row count per table plus a checksum (for example `md5` of the sorted primary keys) on both sides. Fail loudly and roll back on any mismatch.
6. Skip `magic_links` and `oauth_codes` (short-lived). Keep `web_sessions` and `oauth_tokens` so testers stay signed in and connected assistants keep working.
7. `--dry-run` does everything except commit.
8. Run it from inside Railway (a one-off `railway run` or shell on the api service) over the private network, with the SQLite volume mounted. Do not pull the database to your laptop and push it through the public proxy.

Rehearse on a copy of the production SQLite file against a scratch Postgres service, and time it.

## 11. Cutover plan

Expected downtime: minutes for a small database.

1. Done beforehand: sections 3 to 8 merged and deployed with SQLite still in use. Postgres service created, latency measured, backups and PITR on, restore drill done, dry run succeeded.
2. Announce a short maintenance window to testers.
3. Take a final backup (`python -m orbit.backup`). Confirm it landed in S3.
4. Stop the api (scale to zero). Leave web and caddy up; the page shows its error state.
5. Run the copy script for real from the api service shell. Check the verification output.
6. Set `DATABASE_URL` on the api to the Postgres reference variable. Redeploy. Startup runs `run_migrations` and finds nothing to do.
7. Smoke test: `/api/health`, sign in, create a space, share an item, connect an assistant, accept an invite, send a notification email.
8. Watch Sentry and the Postgres service metrics for an hour.
9. Keep the SQLite volume attached and the final S3 backup for at least 14 days. Then detach the volume. Update `docs/deploy-railway.md`: the `/data` volume is no longer needed for Postgres deployments, and the "Redeploys cause a short outage" note changes (the api can then redeploy without a volume handover, though the in-memory events still mean one instance).

**Rollback:** while the SQLite file is untouched, set `DATABASE_URL` back and redeploy. Writes made on Postgres after cutover are lost unless you copy them back, so decide the window up front (suggest: within the first hour, accept the loss; after that, fix forward).

## 12. Work breakdown

| # | Task | Rough size |
|---|---|---|
| 1 | Add psycopg, engine settings, `postgresql_where` on the memory index | small |
| 2 | Postgres test fixtures and CI job, fix whatever breaks | medium |
| 3 | Concurrency audit and fixes with two-thread tests | medium |
| 4 | Create Railway Postgres, measure latency, backups and PITR on, restore drill | small |
| 5 | `pg_dump` backup path | small to medium |
| 6 | Data copy script with verification and dry run | medium |
| 7 | Docs: self-hosting, `deploy-railway.md`, privacy and terms copy | small |
| 8 | Rehearsal, then cutover | small |

Order: 1, 2 and 3 can ship in one PR while production still runs SQLite. Task 4 can happen in parallel. Then 5, 6, 7, then 8.

## 13. Decisions (2026-11-22)

- Railway Pro: **yes**. Native backups and PITR are available.
- Environment older than 16 Oct 2025: **no**. Private networking is dual-stack; no new environment needed.
- Real users: **none yet**. Sections 10 and 11 (data copy and cutover) are **skipped**. Start empty on Postgres.
- Still assumed: self-hosters keep SQLite as the default.

### Simplified plan (no data to move)

Do tasks 1 to 5 and 7 from section 12. Skip task 6 (copy script) and the rehearsal part of task 8.

Switch-over, since nothing needs preserving:

1. Merge the code changes (tasks 1 to 3, 5). Production still runs SQLite.
2. Create the Postgres service, run the latency check (section 4.5), turn on backups and PITR, do the restore drill (section 8).
3. Set `DATABASE_URL` on the api to the Postgres reference variable and redeploy. Startup runs `run_migrations` on the empty database.
4. Smoke test (section 11, step 7). Testers and test data in the old SQLite file are discarded, so tell anyone who signed in that they must sign in again and reconnect their assistant.
5. Keep the SQLite volume attached for 14 days in case you want to look at old data, then detach it. Update `docs/deploy-railway.md` as in section 11, step 9.

If real users appear before you do this, reinstate sections 10 and 11.
