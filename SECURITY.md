# Security policy

## Reporting a vulnerability

Please report security problems privately so they can be fixed before they are public.

On GitHub, open this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report. Please do not open a public issue or post details elsewhere until a fix is out.

Include what you found, the steps to reproduce it, what an attacker could do with it, and the version or commit you tested.

You will get an acknowledgement as soon as the maintainers see it, usually within a few days. After that you will be told whether it is confirmed, and you will be credited in the changelog if you want to be.

## Supported versions

Only the latest release and the `main` branch get fixes. Orbit is at version 0.x, so expect fast change. You can also email [support@orbitspaces.ai](mailto:support@orbitspaces.ai) if you cannot use GitHub's private reporting.

## What matters most

Reports in these areas are especially welcome:

- Reading or changing another space's data without being a member of it.
- Anything reaching a space that a person did not explicitly ask to share.
- Sign-in, session and OAuth flaws: stolen or replayable tokens or codes, redirect handling, PKCE or resource-indicator bypass, consent bypass, cross-site request forgery.
- Server-side request forgery through client metadata documents, which Orbit fetches.
- Shared content that makes a viewer's browser or a member's assistant act on it as if it were an instruction.
- Secrets, shared content or sign-in links appearing in logs, error reports or emails.

Out of scope: volume-based denial of service, missing headers with no demonstrated impact, problems that need a misconfigured server, flaws in third-party services Orbit talks to, and social engineering.

## Review status

The sign-in and OAuth code in `api/orbit/auth/` and `api/orbit/oauth/` is covered by automated tests, including a full connect flow driven by the official MCP client.

Before release it also had an independent review by a separate AI agent that worked only from the code and the design document and was asked to find real, exploitable problems. It found no way to read or change another space's data, no authentication bypass, no cross-site request gap, no session flaw and no working request forgery in the client metadata fetch. It did find availability, consent-screen and invite problems. The ones that could be fixed safely were fixed and have tests (see the changelog). The rest are listed under Known limitations below.

That review is not a substitute for a person. The design requires a **human** security review before real people use a public instance, and it has not happened yet. Until it does, treat a public Orbit as experimental.

## Where a reviewer should start

- `api/orbit/auth/` and `api/orbit/oauth/`: emailed-link sign-in, sessions, the OAuth provider, consent, and client registration (metadata documents and dynamic registration).
- `api/orbit/services/`: the membership check that guards every read and write. MCP tools and REST routes both call these functions.
- `api/orbit/render.py`: how shared text is wrapped as data in tool results.
- `api/orbit/llm.py`: how shared text is wrapped as data in the combine prompt.

What the code already does, so a reviewer can look for gaps rather than rediscover it:

- The authorization-code flow requires PKCE with S256, a `resource` that equals Orbit's connector address, and returns the issuer in the redirect.
- Codes, refresh tokens, sessions and sign-in links are random, stored only as SHA-256 hashes, and single-use where that applies. Reusing a refresh token revokes the family.
- Client metadata documents are fetched over HTTPS only, from public addresses only, with no redirects, a size cap and a short timeout.
- State-changing web routes require the site's own origin.
- Sign-in, registration and waitlist requests are rate limited.
- Logs record route templates, never query strings.

## Known limitations

These are known and not fixed in this version. Some are deliberate trade-offs of a small private test.

- **Invite links are bearer links.** Whoever holds a valid link can join the space until it is used or expires after 7 days. There is no screen to list or cancel open invites, and only the person who sent an invite is emailed when it is accepted. Other members see the new person arrive in the space. If a link leaks, delete the space or wait for it to expire. An invite sent to a specific email address only opens a private-testing server to that address.
- **The consent screen cannot prove who an assistant is.** Any client can register itself under any name. The consent page therefore shows where Orbit will send the person and says plainly that the name cannot be checked. Redirect addresses must be `https`, plain `http` on the local machine, or a reverse-domain custom scheme such as `com.example.app`.
- **Sign-in links work in any browser.** A link is not tied to the browser that asked for it, so a person can be tricked into pressing the button on someone else's link and land in that person's account. The confirmation page limits this to one deliberate press.
- **Sign-in limits can be used to annoy someone.** Five link requests per hour per email address means anyone can use up a person's five requests, which also sends that person five emails.
- **Anyone can see whether an address is on the allowlist.** A server in private testing says so on the sign-in page.
- **A consent page can be used more than once** within its 15 minutes, and replaying an authorization code is rejected but does not revoke tokens already issued from its first use.
- **Anonymous floods can slow a small server.** Orbit limits request sizes and the number of sign-in, registration and authorization attempts per address, but it runs one process on one SQLite file. Put a rate limiter in front of a server that faces the open internet.
- **No cap on the history of a fact.** Members are trusted collaborators, so a member can add very many versions of a fact and slow the space down.
- **Demo mode skips sign-in on purpose.** With `ORBIT_DEMO_MODE=true`, anyone who can reach the server can become one of two fixed test people (`alex@example.com` or `blake@example.com`). Orbit refuses to start with it on unless `ORBIT_BASE_URL` is `localhost` or `127.0.0.1`, and logs a warning. That stops accidents, not a person who exposes a local server to a network, so keep it off anywhere real people sign in.
- **Rate limits trust the client address your proxy reports.** Behind Caddy in `docker-compose.yml` that is safe. Behind Railway it depends on Railway overwriting `X-Real-IP`. See [docs/deploy-railway.md](docs/deploy-railway.md) for a test you can run.
