# Contributing to Orbit

Thanks for helping. Orbit is deliberately small, so the most useful contributions are usually fixes, clearer docs, tests, and well-argued small features. For anything bigger, open an issue first and describe the situation you are trying to solve. The non-goals in [the design document](docs/superpowers/specs/2026-11-19-orbit-mvp-design.md) are a good thing to read before you propose something large.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md), not in an issue.

## Layout

```
api/      FastAPI service: MCP endpoint, OAuth server, sign-in, REST, database, email, combine
web/      Next.js app: screens only, no business logic
docs/     Guides and the design document
deploy/   Railway files
```

Inside `api/orbit/`:

- `services/` holds each action once. MCP tools and REST routes are thin wrappers that call the same service functions, and the membership check lives there.
- `auth/` and `oauth/` hold sign-in and the OAuth server. Changes here get extra scrutiny.
- `mcp_server.py`, `routes/` are the two front doors.
- `render.py`, `llm.py` wrap shared text as data for tool results and for the combine prompt.
- `space_templates.py` defines the template format and loads the built-in files in `templates/spaces/` when the api starts. `services/templates.py` reads, edits and drafts a space's template.

## Running it for development

You need Python 3.11 or newer, Node 22.12 or newer, and optionally Docker.

**api**

```
cd api
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev,sentry,backup]"
cp ../.env.example .env
```

On Windows, activate with `.venv\Scripts\activate` instead. In `api/.env`, set `ORBIT_SECRET_KEY` to a long random string and `ORBIT_BASE_URL=http://localhost:3000`. Then:

```
uvicorn orbit.main:create_app --factory --reload --port 8000
```

With no `SMTP_HOST`, emails are printed in this terminal, including sign-in links.

**web**

```
cd web
npm ci
ORBIT_API_URL=http://localhost:8000 npm run dev
```

Open <http://localhost:3000>. In development Next.js forwards `/api`, `/auth`, `/oauth`, `/mcp` and `/.well-known` to the api, so there is one address, as in production.

**The whole stack in Docker**

```
cp .env.example .env
docker compose up -d --build
```

## Checks

Run these before opening a pull request. CI runs the same ones.

```
cd api
ruff check .
ruff format --check .
mypy
pytest
```

```
cd web
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

There is also one browser test of the main path (sign in, create a space, share, see it in the feed, set a fact, accept an invite as a second person):

```
cd web
npx playwright install chromium
npm run test:e2e
```

## Conventions

- **No code comments.** No `#`, `//`, `/* */` or docstrings, in any language or file type, including configuration. Make the name say what the comment would have said. Explanations belong in the docs.
- **Use design tokens.** Colour comes from tokens such as `bg-primary` or `text-muted-foreground`, never a raw colour or a `dark:` colour override, and a test enforces that. New colours go in `web/app/globals.css` with both a light and a dark value.
- **Types in their own files.** In `web/`, TypeScript types live in a `*.types.ts` file next to the thing they describe.
- **Tests with every change.** New behaviour gets a test, and the test should fail without the change. Every component gets tests. Every service action has a test for the membership rule.
- **One implementation per action.** Do not copy logic between an MCP tool and a REST route. Put it in `services/` and call it from both.
- **Shared content is data.** Render it as text, never as HTML. Delimit it when it goes into a tool result or a prompt. Never put it in a log line, an error report or an email.
- **Plain words in the interface.** No jargon such as "MCP" outside the settings page.
- **Small, additive changes.** Keep existing environment variables, API fields and defaults meaning what they meant, and say so in the pull request if you cannot.

## Contributing a space template

A template gives a space a purpose: which facts to suggest, how the combined plan is laid out, and what to prompt people for. Each built-in template is one small TOML file in `api/orbit/templates/spaces/`, and adding one needs no code change.

1. Copy an existing file, for example `trip.toml`, to `<your-id>.toml`. The `id` inside the file must match the file name: lowercase letters, digits and single hyphens, at most 40 characters.
2. Fill in the fields. `icon` (one emoji) and `order` (a number; lower comes first among the starting points) are optional. Stay within the limits: `name` 40 characters, `description` 120, up to 10 `[[facts]]` (a `key` of up to 100 and a `hint` of up to 120), up to 8 `plan_sections` of up to 60 characters, a `combine_hint` of up to 500, and up to 5 `tips` of up to 100. Orbit always puts "To settle" last, so it counts toward the 8 sections.
3. Run the template test: `pytest tests/test_space_templates.py`. A file that is not valid stops the api from starting and names the file and the problem, so a mistake is caught here and never reaches people.
4. Open a pull request.

A contributed template must be general purpose and contain no brand names or personal names. Template text is treated as layout guidance and never as instructions, but it is still read by an AI model when members combine, so keep it plain and short. Changing a built-in file does not change spaces that already exist, because each space keeps its own copy.

## Pull requests

1. Fork, branch, make a focused change.
2. Fill in the pull request template honestly, including what you could not test.
3. CI must pass. Pull requests that touch `api/orbit/auth/` or `api/orbit/oauth/` will be read especially carefully, so explain what you changed and why it is safe.

## Developer Certificate of Origin

Orbit uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO) instead of a contributor agreement. It is a short statement that you wrote the change or have the right to submit it under the project's licence. You agree to it by ending every commit message with a line like this:

```
Signed-off-by: Your Name <you@example.com>
```

Git adds it for you with `git commit -s`. To add it to commits you already made, use `git commit --amend -s` for the last one, or `git rebase --signoff origin/main` for the whole branch, then push again. The name and email should be your own, and match your commit author. A CI check fails the pull request when a commit has no sign-off. Commits from bots such as Dependabot are exempt.

By contributing you agree that your contribution is licensed under the [GNU Affero General Public License v3.0 only (AGPL-3.0-only)](LICENSE), the same as the rest of the project. The names and logos are not part of that licence; see [TRADEMARK.md](TRADEMARK.md).

If you run the web app outside Docker, Next.js collects anonymous usage statistics during development unless you turn them off with `npx next telemetry disable` or `NEXT_TELEMETRY_DISABLED=1`. Orbit's own images already turn it off.
