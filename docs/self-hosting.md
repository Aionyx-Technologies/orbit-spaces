# Self-hosting Orbit

Orbit runs as three containers from one `docker-compose.yml`: **caddy** (the only thing that faces the internet), **api** (Python) and **web** (Next.js). Data lives in one SQLite file on a Docker volume.

The shortest path is in the [README](../README.md). This page covers everything after that.

## What you need

- A machine with Docker and Docker Compose v2. One small server is enough.
- A domain name pointing at that machine, if you want ChatGPT, Grok or Claude to connect. Assistants call Orbit from their own servers, so they need a public HTTPS address on the standard port 443. Without a domain you can still run Orbit on `localhost` and use the web app.
- Ports 80 and 443 open and free on the machine.
- An SMTP account for sending email (sign-in links, invites, activity). Without one, Orbit prints each email to its log, which is fine for trying it out and useless for real users.
- Optional: an API key for an AI provider, or a model of your own (for Combine; see [AI provider](#ai-provider)), and an S3-compatible bucket (for backups).

## Put it on a domain with HTTPS

1. Create a DNS record (A, and AAAA if you have IPv6) for the name you want, for example `orbit.example.com`, pointing at the machine.
2. Copy the example settings and edit them:

   ```
   cp .env.example .env
   ```

   Set at least:

   ```
   ORBIT_BASE_URL=https://orbit.example.com
   ORBIT_SECRET_KEY=<a long random string>
   SMTP_HOST=smtp.your-provider.example
   SMTP_USER=...
   SMTP_PASSWORD=...
   EMAIL_FROM=Orbit <orbit@orbit.example.com>
   ```

3. Start it:

   ```
   docker compose up -d --build
   ```

4. Caddy requests and renews a certificate by itself the first time the domain is used. Check `https://orbit.example.com/api/health`; it should answer `{"status":"ok"}`.

**Pick the domain once.** Orbit's sign-in server and connector address are tied to `ORBIT_BASE_URL`. Changing it later makes every connected assistant sign in again and invalidates open sign-in links.

`ORBIT_BASE_URL` must be exactly the address people type: scheme and host, no path, no trailing slash. `http://` is accepted only for `localhost`.

## Settings

Everything is an environment variable, read from `.env` by Docker Compose. `docker-compose.yml` lists each one, so a setting that is not listed there never reaches the container.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ORBIT_BASE_URL` | yes | `http://localhost:3000` in the api; `.env.example` sets `http://localhost` | The public address of your Orbit. Used for links in emails, cookies, the OAuth issuer and the connector address (`<base>/mcp`). |
| `ORBIT_SECRET_KEY` | yes | none | At least 32 characters. Signs consent pages and derives client secrets. Keep it private and keep it the same across restarts; changing it breaks open consent pages and the secrets of clients that registered with a secret. |
| `ORBIT_ALLOWED_EMAILS` | no | empty (open sign-up) | Comma-separated list of email addresses allowed to sign up. See [Limiting who can join](#limiting-who-can-join). |
| `ORBIT_DEMO_MODE` | no | empty (off) | Set to `true` to add "Continue as Alex" and "Continue as Blake" buttons that sign in without an email. For trying Orbit on your own machine only. See [Demo mode](#demo-mode). |
| `DATABASE_URL` | no | `sqlite:////data/orbit.db` | Where the data lives. Leave it alone with Docker Compose; `/data` is the volume. To use Postgres instead, set a `postgresql://user:password@host:5432/dbname` URL (see [Postgres](#postgres)). |
| `SMTP_HOST` | no | empty | Mail server. Empty means emails are printed to the api log. |
| `SMTP_PORT` | no | `587` | Port 587 uses STARTTLS. Port 465 uses TLS from the start. |
| `SMTP_USER` | no | empty | Login. Orbit refuses to send credentials over a connection that is not encrypted. |
| `SMTP_PASSWORD` | no | empty | Password or API key for the mail account. |
| `ORBIT_MAX_CREATED_SPACES` | no | empty (no limit) | Most spaces one person can create. Spaces they only joined do not count, and a deleted space frees a slot. Someone at the limit sees "You can create up to N spaces on the free plan." |
| `ORBIT_MAX_UPDATE_EMAILS_PER_DAY` | no | empty (no limit) | Most update emails one person gets in a rolling 24 hours. Updates over the limit are not lost: they go into that person's morning summary (8:00 in their time zone). Sign-in, invitation and account emails are never limited. The counter is kept in memory, so it resets when the server restarts. |
| `RESEND_API_KEY` | no | empty | Sends email through [Resend](https://resend.com)'s HTTPS API instead of SMTP. When set, it is used and the `SMTP_*` settings are ignored. Useful on hosts that block outbound SMTP. |
| `EMAIL_FROM` | no | `Orbit <orbit@localhost>` | The From header. Use an address on a domain you control. |
| `ANTHROPIC_API_KEY` | no | empty | Turns on Combine and template drafts using Anthropic. Without this or `GEMINI_API_KEY` the Combine button is hidden and everything else works. |
| `ORBIT_FREE_AI_USES` | no | `20` | AI uses each person gets per month. One Combine, template draft or start-from-a-sentence is one use; a call that fails gives its use back, and a Combine that finds nothing new is free. The month starts on the day the person signed up. Set `0` to turn the limit off, which is what most self-hosted servers want. |
| `STRIPE_SECRET_KEY` | no | empty | Stripe secret key for paid plans. Billing is off unless all six `STRIPE_*` settings are set. Stripe test keys start `sk_test_`; use one while you try it out. Never share it or commit it. |
| `STRIPE_WEBHOOK_SECRET` | no | empty | Signing secret (`whsec_...`) of the Stripe webhook endpoint. Orbit rejects any webhook that does not carry a valid signature. |
| `STRIPE_PRICE_PLUS_MONTHLY` | no | empty | Id (`price_...`) of the recurring monthly Plus price. |
| `STRIPE_PRICE_PLUS_YEARLY` | no | empty | Id of the recurring yearly Plus price. |
| `STRIPE_PRICE_AI_PACK` | no | empty | Id of the one-off price for a pack of extra AI uses. |
| `STRIPE_PRICE_EMAIL_PACK` | no | empty | Id of the one-off price for a pack of extra update emails. |
| `COMBINE_MODEL` | no | `claude-opus-5-5` | The Anthropic model used for Combine and template drafts. |
| `GEMINI_API_KEY` | no | empty | Turns on Combine and template drafts using Google's Gemini API. Use a key from a project with billing turned on (see [Combine](#combine)). |
| `GEMINI_MODEL` | no | `gemini-4-hydrogen` | The Gemini model used for Combine and template drafts. |
| `GEMINI_USE_VERTEX` | no | `false` | Set to `true` when `GEMINI_API_KEY` is a Vertex AI API key from the Google Cloud console (Vertex AI express mode). Requests then go to `aiplatform.googleapis.com` and are billed to the Google Cloud project, so Google Cloud credits apply and no Gemini API prepaid balance is needed. |
| `OPENAI_MODEL` | no | empty | The model name sent to an OpenAI-compatible service, for example `gpt-5.5` or `llama3.1`. Required to use one. Orbit guesses no default, because the right name depends on the service. |
| `OPENAI_API_KEY` | no | empty | Key for a hosted OpenAI-compatible service. Leave empty for a local server that needs none. |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | Address of an OpenAI-compatible server, ending in `/v1`. Set it to use OpenRouter, Ollama, LM Studio, vLLM or any other server that speaks the Chat Completions API. |
| `ORBIT_AI_PROVIDER` | no | empty | `anthropic`, `gemini` or `openai`. Only needed when more than one is set up. When empty, Anthropic is used if its key is set, then Gemini, then an OpenAI-compatible service (when `OPENAI_MODEL` and a key or address are set). Orbit refuses to start if it names a provider that is not fully set up. |
| `SENTRY_DSN` | no | empty | Turns on error tracking. See [Error tracking](#error-tracking). |
| `BACKUP_S3_BUCKET` | no | empty | Turns on nightly backups. See [Backups](#backups). |
| `BACKUP_S3_ENDPOINT_URL` | no | empty | For S3-compatible storage that is not Amazon S3. |
| `BACKUP_S3_REGION` | no | empty | Region name, if your provider needs one. |
| `BACKUP_S3_PREFIX` | no | `orbit/` | Folder inside the bucket. |
| `BACKUP_KEEP_DAYS` | no | `14` | How many days of backups to keep. |
| `BACKUP_HOUR_UTC` | no | `3` | Hour (0 to 23, UTC) after which the nightly backup runs. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | with backups | empty | Credentials for the bucket. Orbit uses the standard AWS client, which reads these. |
| `ORBIT_OPERATOR_NAME`, `ORBIT_CONTACT_EMAIL`, `ORBIT_DATA_LOCATION` | no | empty | Shown on the privacy page: who runs this Orbit, how to reach them, and where the data is stored. Fill these in before inviting anyone. |

To take payments, follow [Payments (Stripe)](#payments-stripe).

## Email

Orbit sends these emails: sign-in links, invites, "someone accepted your invite", and activity (a new item, a changed fact, a new plan).

- Activity emails go to every member except the person who acted, only if notifications are on for that space. They are batched: at most one per person per space every 5 minutes, listing what changed. They contain titles and names, never the content people shared.
- Sign-in links work once and expire after 15 minutes. Opening the link shows a page with one button, **Continue to Orbit**; pressing it signs the person in. This stops mail scanners that open every link from using it up.
- Emails wait in memory and are retried up to three times if the mail server refuses them. A crash can lose emails that were still waiting, and a normal shutdown sends them first.

Set up **SPF** and **DKIM** for the domain in `EMAIL_FROM` with your mail provider. Without them, sign-in links tend to land in spam, and people will think Orbit is broken.

To check your settings, ask for a sign-in link for an address you control and watch `docker compose logs -f api`. A failure is logged as "Sending an email failed" without the message content.

## Combine

Combine sends **one request** to the AI provider you set up when a member presses the button or asks their assistant to combine. The request contains the space's current facts and up to the 50 most recent items that are not plans (trimmed to a total size limit), plus the optional instruction the person typed. Nothing is sent until someone asks, and nothing is sent if no provider is set up. Setting up a space from a sentence uses the same provider.

- Limit: 10 combines per space per day, and one at a time per space.
- If nothing new was shared since the last plan, Combine returns the existing plan instead of calling the model, unless the person gave an instruction.
- Set a **monthly spending cap** on the key before inviting anyone: in the Anthropic Console, on the OpenAI or OpenRouter account, or as a budget on the Google Cloud project behind your Gemini key.

## AI provider

Orbit does not include a model and does not ship with a key. Without one, everything works except Combine and AI-drafted spaces, and those buttons are hidden. **You bring your own**, from any one of these:

| You use | Set |
|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY`, and optionally `COMBINE_MODEL` |
| Google Gemini | `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` and `GEMINI_USE_VERTEX` |
| OpenAI | `OPENAI_API_KEY` and `OPENAI_MODEL` |
| OpenRouter or another hosted OpenAI-compatible service | `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENAI_MODEL` |
| A model on your own hardware (Ollama, LM Studio, vLLM, llama.cpp) | `OPENAI_BASE_URL` and `OPENAI_MODEL` |

If several are set, `ORBIT_AI_PROVIDER` picks one. If it is empty, Anthropic wins, then Gemini, then the OpenAI-compatible service.

**Running a model locally.** Start your server so it exposes the OpenAI-compatible API, then point Orbit at it. With Ollama on the same machine as Docker:

```
OPENAI_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_MODEL=llama3.1
```

`localhost` inside the api container is the container itself, so use `host.docker.internal` (Docker Desktop, or add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `api` service on Linux), or the address of the machine that runs the model. Orbit needs no key for a server that does not ask for one. Quality varies a lot by model. Combine and AI-drafted spaces need a model that follows instructions and can answer in JSON, so try a capable one (around 8 billion parameters or more) before blaming Orbit.

Notes by provider:

- **Gemini:** use a key from a project with billing turned on. Google's terms let it use what is sent through unpaid (free tier) keys to improve its products, and people may review it, which is not acceptable for what members share in a space. Check Google's current Gemini API terms before you rely on this.
- **OpenAI-compatible services:** each has its own data-handling terms. Orbit sends the prompt and the shared text and nothing else, but what the service keeps or trains on is its policy, not Orbit's. Check it before you choose one. A server on your own hardware sends nothing off the machine.
- **All providers:** shared text is delimited as data and the prompt says to treat it that way, which lowers the risk of prompt injection but cannot remove it. A weaker model resists it less.

Orbit logs the kind of failure (a refused key, a busy service, a timeout) and never the key or the text it sent.

## Payments (Stripe)

Paid plans are optional. Billing is off unless all six `STRIPE_*` settings in the [settings table](#settings) are set, and a server without them behaves as if billing did not exist. Orbit stores only Stripe's customer id, subscription id, plan, status, billing dates and a record of credit packs. Card details are typed on Stripe's pages and never reach Orbit.

1. **Create the four prices** in the Stripe dashboard (Product catalog): a recurring monthly price and a recurring yearly price for Plus, a one-time price for the AI pack (100 AI uses) and a one-time price for the email pack (500 instant update emails). Put each price id (`price_...`) in the matching `STRIPE_PRICE_*` setting. The app and the landing page show the amounts as text ($6 a month, $60 a year, $5 for the AI pack, $3 for the email pack), so set your Stripe prices to match them.
2. **Add a webhook endpoint** in Stripe at `https://<your host>/api/billing/webhook` and subscribe it to these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded` and `invoice.payment_failed`. Copy the endpoint's signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`. Orbit refuses any request without a valid signature. Webhook bodies are limited to 256 KB like every other request, which is far more than these events need.
3. **Pin the endpoint's API version** to your Stripe account's current version when you create it, and do not change it casually. Where a field sits in an event can differ between versions, so change the version only after trying it in test mode.
4. **Restart the api** so it reads the settings. Settings then shows a Billing card and the landing page shows the pricing section.

**Try test mode first.** Use a secret key that starts `sk_test_`, test-mode prices and a test-mode webhook. Pay with the test card `4242 4242 4242 4242`, any future expiry and any CVC. To test on your own machine, use the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```
stripe listen --forward-to localhost:<port>/api/billing/webhook
```

`<port>` is the port your api listens on. The command prints a signing secret that starts `whsec_`; use it as `STRIPE_WEBHOOK_SECRET` while you test. Switch to live keys, live prices and a live webhook when you are ready.

**Switching from test to live.** Test-mode customers and subscriptions do not exist in live mode, so anyone who tried Plus in test mode would stay Plus forever and their billing links would point nowhere. Before you put in live keys, stop the api, back up the database and delete the test billing records:

```sql
BEGIN;
DELETE FROM ai_use_ledger WHERE grant_id IS NOT NULL;
DELETE FROM email_send_log WHERE grant_id IS NOT NULL;
DELETE FROM credit_grants;
DELETE FROM billing_accounts;
DELETE FROM stripe_events;
COMMIT;
```

The first two lines remove AI uses and emails that were paid from test packs, which the grants they point at would otherwise keep alive. Everyone is then on Free, with their usual monthly AI uses. Then set the live keys, live prices and the live webhook secret and start the api.

What to know:

- Checkout accepts cards only.
- A cancelled subscription stays Plus until the end of the period that was paid for. A full refund of a pack removes the credits that are still unspent; credits already used stay used. Packs last 365 days.
- Deleting an account first asks Stripe to cancel the subscription and delete the customer. If Stripe cannot be reached (a connection error, a timeout, rate limiting or a Stripe server error), the deletion is refused with a 503 and nothing is deleted, so nobody keeps paying for an account that is gone; the person can try again a few minutes later. Any other Stripe error, such as a wrong secret key, is logged by its type only and the account is deleted anyway, so a misconfigured server never makes deletion impossible; in that case cancel the customer in the Stripe dashboard yourself. Stripe keeps its own records.
- On Plus, AI uses are counted per month of the subscription: a monthly plan follows Stripe's billing period, and a yearly plan gets a fresh 150 every month, counted from the day the subscription started. Moving from Plus to Free, or switching between monthly and yearly in a way that changes the period's start, starts a new monthly count, so a person can get a few more uses that month. This is by design and bounded to one extra allowance per change.
- Where the Free plan has no limit (`ORBIT_FREE_AI_USES=0` or `ORBIT_MAX_UPDATE_EMAILS_PER_DAY=0`), Plus has none either, and the matching pack is not offered: the button is hidden and checkout refuses it with 409 `pack_not_needed`.
- Orbit remembers each Stripe event it has handled so a redelivery changes nothing, and forgets those records after 90 days (Stripe stops retrying after three).
- Tax is your responsibility as the operator. Stripe Tax can calculate it, but registering and filing are up to you. The terms say the operator is responsible for tax.

## Limiting who can join

`ORBIT_ALLOWED_EMAILS` is a comma-separated allowlist, for example `me@example.com, partner@example.com`.

- Unset or empty: anyone can sign up. This is the default for self-hosters.
- Set: only these addresses, anyone who already has an account, and anyone holding a valid invite to a space can sign in. Anyone else sees "Orbit is in a small orbit for now" and can leave an address on a waitlist. The waitlist is a table in the database; Orbit does not email it.

## Demo mode

For looking around without setting up email, set `ORBIT_DEMO_MODE=true` in `.env`. The home page and the sign-in page then offer **Continue as Alex** and **Continue as Blake**, which sign in straight away as two test people. The first time, Orbit creates both accounts and some sample spaces: "Goa trip" (shared by both, with three notes shared through different assistants, three facts and a plan written by Orbit), an empty "Weekend in Lisbon", and Blake's "Cabin weekend" (shared with Alex) and "Book club". It also leaves two invitations waiting so you can try **Pending spaces**: Alex invited Blake to "Weekend in Lisbon", and Blake invited Alex to "Book club". If you decline one, signing in as that person with the demo button brings it back. Open one person in a normal window and the other in a private window to try the two-person flow.

This switches sign-in off for those two accounts, so it is only for your own machine:

- Orbit refuses to start with demo mode on unless `ORBIT_BASE_URL` points at `localhost` or `127.0.0.1`, and it logs a warning whenever it is on.
- Anyone who can reach a server that is running in demo mode can become Alex or Blake. Do not expose one to a network you do not trust, and turn it off (leave the variable empty) before real people use the server.
- The demo accounts are ordinary accounts with the addresses `alex@example.com` and `blake@example.com`. Delete them under **Settings** when you are done, or remove the Docker volume.

## Postgres

SQLite is the default and is enough for a small group. To run on Postgres instead, create an empty database and set `DATABASE_URL` to `postgresql://user:password@host:5432/dbname`. Orbit creates its tables on startup. `postgres://` and `postgresql://` URLs are accepted as they are.

Keep the database on a private network where you can; do not expose it to the internet. Orbit opens up to 10 connections. Moving existing data from SQLite to Postgres is not automated, so choose before people start using your Orbit.

## Backups

With Postgres, the nightly backup runs `pg_dump` (included in the Docker image) and uploads `<prefix>orbit-YYYYMMDD.dump`, then prunes old uploads the same way. The image's `pg_dump` must be at least as new as your Postgres server; if the backup reports a version mismatch, rebuild with `--build-arg PG_CLIENT_MAJOR=<server major version>`. Restore with `pg_restore --no-owner --dbname <url> orbit-YYYYMMDD.dump` into an empty database. Your host's own Postgres backups are worth turning on as well. The rest of this section describes SQLite.

SQLite is one file, so backups are simple, but they are only real if they leave the machine.

Set `BACKUP_S3_BUCKET` (and the `AWS_*` credentials) and Orbit takes a consistent snapshot every night using SQLite's online backup, compresses it, uploads it as `<prefix>orbit-YYYYMMDD.db.gz`, and deletes uploads older than `BACKUP_KEEP_DAYS`. It runs once a day after `BACKUP_HOUR_UTC` and again after a restart if that day's backup is missing.

Any S3-compatible service works. Examples:

| Provider | `BACKUP_S3_ENDPOINT_URL` | `BACKUP_S3_REGION` |
|---|---|---|
| Amazon S3 | leave empty | your bucket's region |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | the region in the endpoint |

Run a backup right now to test your settings:

```
docker compose exec --user orbit api python -m orbit.backup
```

It prints the object key it uploaded. **Test a restore at least once**:

1. Download a backup from the bucket into the folder that holds `docker-compose.yml`, and unzip it: `gunzip orbit-20261119.db.gz`.
2. Stop the api: `docker compose stop api`.
3. Copy the backup over the live database, from that same folder:

   ```
   docker compose run --rm --no-deps --user orbit -v "${PWD}:/restore:ro" --entrypoint cp api /restore/orbit-20261119.db /data/orbit.db
   ```

4. If the api crashed instead of stopping cleanly, also remove its leftover write-ahead files, so SQLite cannot replay them onto the restored copy:

   ```
   docker compose run --rm --no-deps --user orbit --entrypoint rm api -f /data/orbit.db-wal /data/orbit.db-shm
   ```

5. Start it again: `docker compose start api`.

Backups contain everything people shared. Treat the bucket like the database: private, with access limited to you. Deleted spaces and accounts stay in backups until those backups expire.

## Error tracking

Set `SENTRY_DSN` to send unhandled errors to Sentry (or any service that accepts Sentry's protocol). Orbit turns off Sentry's default collection of personal data and removes request bodies, cookies, headers, query strings, breadcrumbs, user details and local variables before anything is sent, so what leaves is the error type, the message and the code location.

Pair it with an uptime check that requests `https://<your-domain>/api/health` every minute. It answers 200 when the database is reachable and 503 when it is not.

## Prebuilt images

Every release is published as two multi-architecture (amd64 and arm64) images on the GitHub Container Registry: `ghcr.io/aionyx-technologies/orbit-api` and `ghcr.io/aionyx-technologies/orbit-web`. Each is tagged with the exact version (`0.1.0`) and the minor version (`0.1`). Versions from 1.0 also get a major tag (`1`). Pre-releases such as `0.2.0-rc.1` get only their exact tag. A `latest` tag follows the newest stable release, but pin a version for anything you care about, so an upgrade happens when you choose it.

To use them instead of building, put these two lines in `.env`:

```
ORBIT_VERSION=0.1.0
ORBIT_PULL_POLICY=always
```

Then:

```
docker compose pull
docker compose up -d
```

`ORBIT_PULL_POLICY=build` (the default) builds from the checkout, which is what you want if you changed the code. The compose file in a release and the images with the same version belong together, so check out the release tag (`git checkout v0.1.0`) when you pin a version.

Each release has notes on its [GitHub releases page](https://github.com/Aionyx-Technologies/orbit-spaces/releases), taken from [CHANGELOG.md](../CHANGELOG.md), including the database migrations it runs and any setting that changed.

## Upgrading

1. Read the changelog entry for every version between yours and the new one. Each release lists its database migrations and any changed or new settings.
2. Take a backup (see [Backups](#backups)).
3. Get the new version, then start it.

   From source:

   ```
   git pull
   docker compose up -d --build
   ```

   With prebuilt images, set the new `ORBIT_VERSION` in `.env`, check out the matching tag, then:

   ```
   docker compose pull
   docker compose up -d
   ```

Database migrations run automatically when the api starts. They only move forward, so **take a backup first**; going back means restoring one. Skipping versions is fine, because migrations run in order.

## Running behind your own proxy

If you already run nginx, Traefik or similar, you can skip the `caddy` service and send traffic yourself:

- `/mcp`, `/oauth/*`, `/auth/*`, `/api/*` and `/.well-known/*` go to `api:8000`. Everything else goes to `web:3000`.
- Do not buffer responses and do not set short read timeouts. The live-update stream at `/api/spaces/<id>/events` stays open.
- Set `X-Forwarded-For` to the real client address and `X-Forwarded-Proto` to `https`, replacing whatever the client sent. The api trusts these headers, because it is meant to be reachable only through the proxy. Never publish the api port directly. If your proxy has a fixed address, set the api's `FORWARDED_ALLOW_IPS` environment variable to it so nothing else can set those headers (the image defaults to `*`).
- Limit request bodies to about 1 MB, as the Caddyfile does, and allow 6 MB for `/api/me/avatar`, the profile photo upload. The api itself refuses anything over 256 KB (5 MB for the photo), but a proxy refuses it before it uses any memory.
- Add a per-address rate limit if the server faces the open internet. Orbit limits sign-in, registration and authorization attempts itself, but it is one process on one SQLite file.
- Keep `ORBIT_BASE_URL` identical to the public address.

## Running more than one copy

Don't. Live updates use in-process memory and the database is one SQLite file, so Orbit runs a single api process. A second copy would not see the first one's live events and would fight over the file.

## You are the operator

When you run your own copy, you are its operator, and the data controller (in GDPR terms) for the people who sign in. That has consequences the hosted service's documents do not cover for you:

- **The hosted service's legal pages do not apply to your copy.** The terms of service and privacy policy written for the Aionyx Technologies, Inc. hosted service describe that service only. Aionyx is not a party to your copy, does not host it, and receives no data from it.
- **Your pages name you.** Set `ORBIT_OPERATOR_NAME`, `ORBIT_CONTACT_EMAIL` and `ORBIT_DATA_LOCATION` in `.env`. The privacy page, terms and data policy at `/privacy`, `/terms` and `/data-policy` use them. Left empty, they fall back to naming Aionyx Technologies, which would be wrong for your server.
- **Have the text reviewed.** The bundled policy text describes what Orbit stores and does. It is a starting point, not legal advice. Check it against your own setup (which mail, AI and backup providers you use, where the server is) and the laws that apply to the people you serve.
- **You answer for your server.** Requests to access, export or delete data come to you. People can export their spaces and delete their account themselves in the app, and you can delete data directly in the database.
- **Orbit sends no telemetry.** The only outside connections are the services you configure: mail, an AI provider, a backup bucket and optionally Sentry.
- **Do not reuse the name.** The Orbit and Aionyx names and logos are trademarks of Aionyx Technologies, Inc. If you offer your copy to other people, give it its own name. See [TRADEMARK.md](../TRADEMARK.md).

## Troubleshooting

**An assistant says it cannot connect.** The address must be public, use HTTPS with a valid certificate, and use the standard port 443. Open `https://<your-domain>/.well-known/oauth-protected-resource/mcp` in a browser; you should see JSON naming your connector address.

**The connector request is refused with an "invalid host" message.** The address the assistant used does not match `ORBIT_BASE_URL`. Fix the variable and run `docker compose up -d`.

**Sign-in emails never arrive.** With `SMTP_HOST` empty they are printed to `docker compose logs api` instead of sent. With it set, look for "Sending an email failed" in the log, then check the credentials, the port, and SPF and DKIM.

**"That link did not work".** Sign-in links work once and expire after 15 minutes. Ask for a new one.

**Ports 80 or 443 are already in use.** Stop whatever is using them, or run your own proxy as described above.

**The build fails with a certificate error** (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` from npm, or an SSL error from pip). Some company networks inspect encrypted traffic with their own certificate, which the build containers do not trust. Build on a network without inspection, or give the build your company's root certificate. Pulling prebuilt images avoids the problem.

**The database seems stuck or locked.** Keep the volume on local disk. SQLite does not work reliably on network file systems such as NFS or SMB.

## Where things are

- Data: the `orbit-data` Docker volume, mounted at `/data` in the api container.
- Certificates: the `caddy-data` volume.
- Logs: `docker compose logs api`. They name routes, never query strings, and never contain shared content, tokens or sign-in links. The one exception is the printed email in development mode, when `SMTP_HOST` is empty.
