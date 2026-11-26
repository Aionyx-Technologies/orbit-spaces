# Orbit

Share what your AI assistants know, across assistants.

Two people who use different AI assistants cannot share work between them. One researches in ChatGPT, the other plans in Grok, and the only bridge is copy and paste. Vendors are adding sharing inside their own apps, but nothing is neutral across assistants.

Orbit is a small open-source service that both assistants connect to as a custom connector (an MCP server). Each person chooses what to share into a shared space. The other person's assistant can read only that. When someone asks, Orbit uses one LLM call to combine everything shared into a single plan, saved in the space and clearly marked as written by Orbit.

The MVP exists to answer one question: **will pairs of people on different assistants keep sharing through Orbit after the first week?**

Orbit is a product of **Aionyx Technologies, Inc.**, a Delaware corporation, which runs the hosted service. Contact: [hello@orbitspaces.ai](mailto:hello@orbitspaces.ai).

> Status: version 0.1.0, live as a hosted service. The source is open under the GNU Affero General Public License v3.0 (AGPL-3.0-only), so you can also run your own copy. Read [Limits](#limits) for what this version does not yet do.

## What it does

- **Share** an item (a note with a title) or a standing fact (a key and a value) from your assistant by saying "share this to Orbit", or from the web page.
- **Read** what the other person shared, from their assistant or the web page. Nothing reaches a space unless the person explicitly asked to share it.
- **Invite** someone by link or by email. They read and reply on a web page with nothing installed. An invitation sent to an email address also waits in their Orbit under **Pending spaces**, so nobody has to dig a link out of an inbox.
- **Combine** everything in a space into one plan on request. Conflicts between people's inputs are listed under "To settle" instead of being quietly resolved.
- **Get told** by email when something changes, even with every chat closed.

Every item shows who shared it, through which assistant, and when. Plans written by Orbit are labelled and look different from anything a person shared.

## The web app

The **Spaces** page shows each space as a card that summarises what is inside: the facts that matter, who added what last, which assistants have been used and who is in it. Filter by **All**, **Yours**, **Shared with you** and **Pending**, search, and sort by recent activity, name or date created. Invitations sent to your email address wait under **Pending spaces**, where you can join or decline them. Press Ctrl+K (Cmd+K on a Mac) anywhere in the app to jump to a space or run a command, and pick a light, dark or system theme from the header.

## 60-second demo

You need Docker with Compose. You do not need an AI assistant for this part.

```
cp .env.example .env
```

Open `.env`, set `ORBIT_SECRET_KEY` to a long random string, and add a line `ORBIT_DEMO_MODE=true` if you want buttons that sign you in as two test people (Alex and Blake) instead of using email links. Demo mode is for your own machine only; see [docs/self-hosting.md](docs/self-hosting.md#demo-mode). One way to make a key that works anywhere Docker does:

```
docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then start everything:

```
docker compose up -d --build
```

This builds the images on your machine. To skip the build and download the published images for a released version instead, add `ORBIT_PULL_POLICY=always` and `ORBIT_VERSION=<version>` (for example `0.1.0`) to `.env`, then run `docker compose pull` and `docker compose up -d`. See [Prebuilt images](docs/self-hosting.md#prebuilt-images).

The first build takes a few minutes. When `docker compose ps` shows all three services running:

1. Open <http://localhost>. With demo mode on, press **Continue as Alex** and skip to step 2. Otherwise enter an email address. With no mail server configured, Orbit prints the email to its log instead of sending it. Run `docker compose logs api` and open the link that starts with `http://localhost/auth/verify`, then press **Continue to Orbit**.
2. Press **New space**, call it "Goa trip", and share a note: "Morning flight on Dec 20".
3. Add a fact: **Budget** is **$3,000**.
4. Press **Invite** and either copy the link, or type a second email address. Open the app in a private window and sign in as that second address (take its link from the log the same way). With an address, the invitation is already waiting under **Pending spaces**: press **Join space**. With a link, open it and accept.
5. In either window, share another note. It appears in the other window without a refresh.

The **Combine** button appears once `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set in `.env`.

## Connect an assistant

Assistants call Orbit from their own servers, so Orbit needs a public HTTPS address. A copy running on `localhost` cannot be connected to ChatGPT, Grok or Claude, but everything above works on it. To go public, follow [docs/self-hosting.md](docs/self-hosting.md) (any machine with Docker and a domain) or [docs/deploy-railway.md](docs/deploy-railway.md) (Railway).

Then add Orbit as a custom connector. The connector address is `https://your-domain/mcp`. Step by step:

- [Connect ChatGPT](docs/connect-chatgpt.md)
- [Connect Grok](docs/connect-grok.md)
- [Connect Claude](docs/connect-claude.md)

When you add the connector, the assistant sends you to an Orbit page to sign in by emailed link and press **Allow**. You can see and revoke connected assistants on the **Assistants** tab.

## How it fits together

```
ChatGPT / Grok / Claude                       Browser
        |  MCP over HTTPS, OAuth bearer          |  cookies
        v                                        v
+---------------------- reverse proxy (Caddy) ----------------------+
|  /mcp  /oauth/*  /auth/*  /api/*  /.well-known/*  ->  api          |
|  everything else                                  ->  web          |
+--------------------------------------------------------------------+
        |                                        |
        v                                        v
   api (FastAPI, Python)  <--- fetch /api ---  web (Next.js)
        |
     SQLite file          SMTP server          LLM API (combine only)
```

- **api** owns the MCP endpoint, the OAuth server, web sign-in, the REST API, the database, email and the combine step. Assistants talk only to api.
- **web** is only the screens. It has no database access and no business logic.
- **Caddy** puts both behind one origin, gets HTTPS certificates automatically, and does not buffer streams.

The design document is in [docs/superpowers/specs/2026-11-19-orbit-mvp-design.md](docs/superpowers/specs/2026-11-19-orbit-mvp-design.md).

## What Orbit stores

Only what people shared, plus the minimum to run an account: email address, display name, sessions, connected assistants and space membership. It never reads an assistant's private chats or built-in memory. Secrets (tokens, codes, links) are stored as hashes. Logs never contain shared content. Anyone can export a space or delete it, and anyone can delete their account. The full plain-English version is [docs/data-policy.md](docs/data-policy.md), and every Orbit server shows it at `/data-policy`, next to its privacy page (`/privacy`) and terms (`/terms`), which say who runs that server and where its data is stored. A disclaimer about AI-written plans and third-party assistants is at `/disclaimer`.

## Hosted service or your own copy

You can use the hosted service run by Aionyx Technologies, Inc., or run your own copy of the same code. Which one you use decides whose rules apply:

- **Hosted service.** Aionyx is the operator. Its terms of service, privacy policy and data policy (the pages at `/terms`, `/privacy` and `/data-policy` on that service) apply to you. Its AI provider for combining and space setup is Google Cloud (Gemini models on Vertex AI), which does not train on that data.
- **Your own copy.** You are the operator and the data controller for everyone who signs in to it. The hosted service's terms and privacy policy do **not** apply to your copy, and Aionyx does not receive or see anything from it. Set `ORBIT_OPERATOR_NAME`, `ORBIT_CONTACT_EMAIL` and `ORBIT_DATA_LOCATION` to your own details, because the legal pages otherwise name Aionyx Technologies, and have the policy text reviewed for your own setup and the laws that apply to you. See [You are the operator](docs/self-hosting.md#you-are-the-operator).

**Telemetry: none.** Orbit does not phone home. It has no analytics, no usage statistics and no update check, and the web app loads nothing from other websites (its fonts and images are bundled). The only connections an Orbit server makes are ones you set up: your mail provider, your AI provider if you add a key, your backup bucket, Sentry if you set `SENTRY_DSN`, and the public client metadata document an assistant points to when it connects. Error tracking is off unless you set that variable, and it removes request bodies, cookies, headers, queries and user details before sending anything.

The name Orbit and the logo are trademarks of Aionyx Technologies, Inc. The code is AGPL-3.0-only, but the names and logos are not; see [TRADEMARK.md](TRADEMARK.md).

## Configuration

Orbit is configured with environment variables. The two you must set are `ORBIT_BASE_URL` and `ORBIT_SECRET_KEY`. Everything else is optional and listed, with defaults, in [docs/self-hosting.md](docs/self-hosting.md). Combine and AI-drafted spaces need an AI provider that you bring yourself: Anthropic, Gemini, OpenAI, any OpenAI-compatible service such as OpenRouter, or a local model through Ollama, LM Studio or vLLM. Without one, everything else still works. See [AI provider](docs/self-hosting.md#ai-provider).

## Limits

Honest list of what this version does not do or cannot promise:

- **One api process.** Live updates use an in-process broadcaster, so the api runs a single worker. Moving to several instances means moving live updates off in-process memory first.
- **SQLite by default.** One file on one volume, with write-ahead logging. Postgres is supported by setting `DATABASE_URL`; existing data is not migrated for you.
- **Assistants cannot be pushed to.** They see new content only when their person asks. Email notifications from Orbit cover the gap.
- **Routing is the assistant's choice.** Tool names and descriptions are written so "share this to Orbit" is a reliable trigger, but an assistant decides when to call a connector, and Orbit cannot force it.
- **Write access may depend on your plan.** Which ChatGPT plans can add custom connectors and use tools that change data is set by OpenAI and can change. Connections from real ChatGPT, Grok and Claude accounts have been tested end to end. The web page can always do everything a write tool can.
- **Combine quality is unproven.** It is one LLM call over what was shared. Shared text is delimited as data and the prompt says to treat it that way, which lowers the risk of prompt injection but cannot remove it. Nothing has yet judged whether the plans are good enough to act on.
- **No independent security review yet.** Sign-in and OAuth are built on the official MCP Python SDK and covered by automated tests, but a person other than the author still needs to review `api/orbit/auth/` and `api/orbit/oauth/` before real people use a public instance.
- **Email depends on your provider.** Set up SPF and DKIM for the sending domain or sign-in links may land in spam. Some company mail systems open links before the person does; Orbit's sign-in link asks for one confirming click so a scanner cannot use it up.
- **Tested on real services.** The Railway deployment, backups to real object storage, and connections from real ChatGPT, Grok and Claude accounts have been exercised end to end.
- **Out of scope for the MVP:** push notifications, a mobile app, billing, team admin, permission levels beyond member or not, and Orbit answering questions in place of the assistant.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

GNU Affero General Public License v3.0 only (AGPL-3.0-only). See [LICENSE](LICENSE). The Orbit and Aionyx names and logos are not covered by that licence; see [TRADEMARK.md](TRADEMARK.md).

If you change Orbit and let other people use your copy over a network, the licence requires you to offer them the source code of your version. The web app links to the source from the landing page footer and the terms page; point `SOURCE_URL` in `web/lib/legal.ts` at your own repository when you run a modified copy.

The web app bundles two typefaces under the SIL Open Font License 1.1: Geist and Instrument Serif. Their licence texts are next to the font files in `web/app/fonts/`.

The ChatGPT, Codex, Claude and Grok logos belong to OpenAI, Anthropic and xAI. They appear in the web app only to show which assistants Orbit works with, they are not covered by the Apache-2.0 licence, and Orbit is not affiliated with or endorsed by those companies. The vector artwork comes from the MIT-licensed [LobeHub Icons](https://github.com/lobehub/lobe-icons) set (Copyright © 2023 LobeHub). The Cursor, Muse, OpenClaw, Hermes Agent and Wabi logos in `web/public/assistants/` belong to their owners and are used on the same terms.

Orbit and the Orbit name are © 2026 Aionyx Technologies, Inc.
