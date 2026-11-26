# Deploy on Railway

This sets up the same three services as `docker-compose.yml`, on [Railway](https://railway.com): **caddy** (public), **api** (private, with a volume) and **web** (private).

> These steps were written from Railway's documentation on 2026-11-19. The images and the Caddy configuration were built and run locally, but nothing here has been run on Railway itself. Expect to adjust a setting or two, and tell the project if you do.

## How it fits

| Service | Public | Root directory | Port | Notes |
|---|---|---|---|---|
| `caddy` | yes, your domain | `deploy/railway` | 8080 | Routes by path to the other two over Railway's private network. Railway ends HTTPS, so Caddy serves plain HTTP here. |
| `api` | no | `api` | 8000 | One instance only. A volume is mounted at `/data` and holds `orbit.db`. |
| `web` | no | `web` | 3000 | Next.js. |

Name the services exactly `api`, `web` and `caddy`. Railway's private addresses are built from service names (`api.railway.internal`, `web.railway.internal`), and the Caddy configuration expects them. If you name them differently, set `API_UPSTREAM` and `WEB_UPSTREAM` on `caddy` to the right `host:port` values.

You need a Railway plan that allows volumes, a domain you control, and an SMTP account for sending email. An Anthropic or Gemini key and an S3-compatible bucket are optional.

**Pick the domain first and keep it.** The connector address (`https://<domain>/mcp`) is what every tester adds to their assistant. Changing it later makes everyone reconnect.

## Steps

1. Create a Railway project and connect this repository. Create three services from it, one each for `api`, `web` and `caddy`, and set each service's **Root Directory** as in the table. Railway builds each from the `Dockerfile` in its root directory.

2. **api**
   - Variables:

     ```
     PORT=8000
     ORBIT_BASE_URL=https://<your-domain>
     ORBIT_SECRET_KEY=<a long random string>
     SMTP_HOST=...
     SMTP_PORT=587
     SMTP_USER=...
     SMTP_PASSWORD=...
     EMAIL_FROM=Orbit <orbit@<your-domain>>
     ORBIT_ALLOWED_EMAILS=<comma-separated testers>
     ORBIT_MAX_CREATED_SPACES=5            # optional free-tier limits, see self-hosting settings
     ORBIT_MAX_UPDATE_EMAILS_PER_DAY=20
     ANTHROPIC_API_KEY=...   # or GEMINI_API_KEY=... to combine with Gemini
     ```

     Railway blocks outbound SMTP on its Free, Trial and Hobby plans. On those plans, use [Resend](https://resend.com) over HTTPS instead: leave the `SMTP_*` variables out and set `RESEND_API_KEY=re_...`, with `EMAIL_FROM` on a domain you have verified in Resend.

     The other settings in [self-hosting](self-hosting.md#settings), such as `SENTRY_DSN` and the `BACKUP_*` and `AWS_*` variables, work the same way. Leave `DATABASE_URL` unset to use SQLite on the volume (the image already points it at `/data`), or use Postgres as described in [Use Railway Postgres](#use-railway-postgres-instead-of-the-volume).
   - **Volume:** add a volume to the service and mount it at `/data`.
   - **Healthcheck path:** `/api/health`.
   - **Replicas:** keep it at one. Railway does not allow replicas on a service with a volume, and Orbit's live updates need a single process anyway.
   - Do not set `RAILWAY_RUN_UID`. Railway mounts volumes as root. The api image starts as root, hands `/data` to its own unprivileged user, and then drops privileges, so no setting is needed.

3. **web**
   - Variables:

     ```
     PORT=3000
     HOSTNAME=0.0.0.0
     ORBIT_API_URL=http://api.railway.internal:8000
     ORBIT_OPERATOR_NAME=<who runs this Orbit>
     ORBIT_CONTACT_EMAIL=<how to reach them>
     ORBIT_DATA_LOCATION=<where the data is stored, for example "Railway, US East">
     ```

4. **caddy**
   - Variables: `PORT=8080`.
   - **Networking:** add your custom domain with target port `8080`, then create the DNS record Railway shows you.

5. Open `https://<your-domain>/api/health`. It should answer `{"status":"ok"}`. Then open `https://<your-domain>/.well-known/oauth-protected-resource/mcp`; it should show JSON naming your connector address.

6. Sign in at `https://<your-domain>/`, create a space, and follow the guide for your assistant: [ChatGPT](connect-chatgpt.md), [Grok](connect-grok.md), [Claude](connect-claude.md).

Then work through the [private launch checklist](private-launch.md) before inviting anyone.

## Use Railway Postgres instead of the volume

For a deployment that survives redeploys without waiting on a volume, and has Railway's own backups and point-in-time recovery (Pro plan), keep the data in Railway Postgres. Do this before anyone uses the instance; data is not moved for you.

1. In the same project and environment as `api`, add a **PostgreSQL** database from Railway's templates. Name it `postgres`.
2. On `api`, set:

   ```
   DATABASE_URL=postgresql://${{postgres.PGUSER}}:${{postgres.PGPASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
   ```

   Use the private domain, not the public one, so the database is never exposed and traffic stays free.
3. You no longer need the `/data` volume. You can still keep the api at one replica; live updates need a single process.
4. Redeploy. Orbit creates its tables on startup. Check `/api/health`.
5. Time a query before launch. Run a few requests and watch the response times in the logs. Railway private networking has been reported to add latency in some regions. If requests feel slow, say so in an issue.
6. Backups: turn on Railway's scheduled backups and point-in-time recovery for the Postgres service, and keep the nightly `BACKUP_*` upload to storage outside Railway. Test a restore from both. The image's `pg_dump` is version 18, which matches Railway's Postgres; if your Postgres is newer, build the api with `--build-arg PG_CLIENT_MAJOR=<version>`.

## Good to know

- **Redeploys cause a short outage.** A service with a volume cannot run two deployments at once, so the api is briefly unavailable while it redeploys. That is fine for a test with a handful of people. The web page shows an error until the api is back.
- **Private networking and IPv6.** Projects created after 16 October 2025 resolve private names to both IPv4 and IPv6, and the images listen on IPv4, which works there. Older environments resolve to IPv6 only, and the images would not be reachable. Create a fresh environment if you are on one of those.
- **Client addresses.** Railway puts the visitor's address in `X-Real-IP`. The Caddy file copies it into `X-Forwarded-For` so Orbit's per-address rate limits see the visitor and not Railway's proxy. That only works if Railway's edge **overwrites** an `X-Real-IP` the visitor sent, which Railway's documentation does not say. Check it once, with the allowlist turned on so no emails are sent:

  ```
  for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " -X POST https://<your-domain>/auth/sign-in -H "Origin: https://<your-domain>" -H "X-Real-IP: 198.51.100.$i" -d "email=probe$i@example.com"; done
  ```

  Every request here claims to come from a different address. If Railway overwrites the header, they all count against your real address and the last five answer `429`. If all 25 answer `403`, Railway passes the header through, and anyone can dodge the per-address limits by forging it. In that case delete the two `header_up` lines for the api in `deploy/railway/Caddyfile` (all visitors then share one limit, which is safe but coarse). If the header were ever missing, all visitors would also share one bucket until it came back.
- **Volume backups.** Railway can back up volumes, but that is inside Railway. The nightly backup to storage outside Railway (see [self-hosting](self-hosting.md#backups)) is what the design asks for.
- **Limits.** Railway ends requests that sit idle for five minutes. Orbit's live-update stream sends a keepalive, so open pages stay connected.
