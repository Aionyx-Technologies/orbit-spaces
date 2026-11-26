# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small groups of people who each use a different AI assistant (ChatGPT, Claude, Grok, Muse, OpenClaw, Hermes Agent, Wabi and others) and need to work on the same thing together. Three groups carry equal weight, and no single one is primary:

- **Friends and family** planning trips, events and households. Many are not technical and have never added a custom connector to their assistant.
- **Freelancer and client pairs** doing two-party professional work, where clarity and a record of who said what matter.
- **Small teams** on shared projects, using a mix of assistants.

Some members join without any assistant. They read and reply on the web.

A second audience is **self-hosting operators**: the people who run a private Orbit instance for a handful of people. They control who gets in with an allow-list and a waitlist.

## Product Purpose

Orbit lets people share what their AI assistants know with each other, even when they use different assistants. Today, people on different assistants can only share work by copy and paste. Orbit gives them shared **spaces**, which hold items, standing facts and a live feed. Each person's assistant reads and writes those spaces through Orbit.

The private launch exists to answer one question: will pairs of people on different assistants keep sharing through Orbit after the first week? Success means they come back and keep sharing.

## Positioning

Orbit is a neutral, open-source MCP server that any assistant can connect to as a custom connector. It is not tied to one assistant's ecosystem. Four claims are core to the product and must be protected:

- **Neutral:** Orbit works the same for every assistant and favours none.
- **Consent:** nothing goes into a space unless someone asks to share it, and they can take it back. Orbit never reads anyone's chats or what their assistant remembers about them.
- **Labelled:** anything Orbit writes, such as a Combine plan, is labelled as Orbit's, so it is never mistaken for a person.
- **Doesn't pick sides:** when people's inputs conflict, Orbit lists the conflict under "To settle" rather than quietly picking a side.

## Operating Context

- Each person adds Orbit to their own assistant as a custom MCP connector, following the guides on the Assistants page. They then share, remember and combine from inside that assistant's chat.
- The web app is where people browse spaces, read the feed, invite others, manage members, connect or revoke assistants, and change settings. The app has a Ctrl+K command palette and light, dark and system themes.
- People join by an invite link or an email invite. Email invites wait under Pending spaces until accepted.
- Sign-in has no password. Orbit emails a link or a code.
- Orbit sends email updates as they happen, as a daily summary at 8:00 in the person's time zone, or not at all.
- Operators self-host with Docker Compose behind Caddy, or on Railway, with nightly backups to S3-compatible storage.

## Capabilities and Constraints

- **Spaces:** each holds items (titled notes), standing facts (key and value, with history) and a live feed. A person can describe a new space in one sentence and, when an AI provider is set up, Orbit suggests a name, a description and facts for them to edit before creating it. Otherwise they pick a starting template: Trip, Holiday gifts, Household, Dinner party, Event, Client project, Team project or Blank.
- **Combine:** one LLM call that turns a space's contents into a plan, labelled as written by Orbit, with conflicts under "To settle".
- **MCP tools:** about 19 tools at `/mcp`. Destructive actions need explicit confirmation. For example, `delete_space` requires the space name typed in.
- **Roles:** a person is either a member of a space or not. Only the creator can delete a space.
- **Terminology:** space, item, standing fact, feed, Combine, "To settle", Pending spaces, assistant, connector.
- **Self-hosting first:** every feature must work on a self-hosted instance (Docker Compose or Railway). Nothing may depend on a hosted-only service.
- **Out of scope:** native mobile apps. The web app is responsive and is tested at phone size.
- **No i18n:** the copy is English only, and the app sets `lang="en"`.

## Brand Commitments

- **Name:** Orbit. The product is open source under AGPL-3.0-only.
- **Logo:** a ring, a core and an orbiting "ember" satellite (`web/components/brand/logo.tsx`, `web/app/icon.svg`). The animation respects reduced motion.
- **Voice:** plain, honest and specific, and candid about limits. The README includes "an honest list of what this version does not do". Lines in that voice include:
  - "Orbit never reads your chats or what your assistant remembers about you."
  - "Nothing goes in unless someone asks to share it, and you can take it back."
- **No affiliation claims:** Orbit must never suggest that the makers of ChatGPT, Claude, Grok or any other assistant endorse it or are affiliated with it. Assistant logos come from LobeHub Icons (MIT) and appear only to identify each assistant. The README carries the non-affiliation disclaimer.

## Evidence on Hand

- **Docs:** `README.md`, `CHANGELOG.md`, and `docs/`, which holds the connect guides, self-hosting, Railway, the data policy and the private-launch checklist.
- **Design specs:** `docs/2026-11-19-orbit-mvp-design.md` and the 2026-11-20 specs.
- **Illustrative content:**
  - The landing walkthrough in `web/components/landing/how-it-works.tsx` (Alex, Blake and Priya planning Vegas).
  - The demo seed: "Cabin weekend", "Book club" and "Weekend in Lisbon", for the demo people Alex and Blake.
  - The README's "Goa trip" example.
- **Absent, so never fabricate:** there are no testimonials, customers, usage numbers or press. Orbit has not yet been tested against real ChatGPT, Grok or Claude accounts. Do not claim it has been, and do not claim support beyond what the connect guides document.

## Product Principles

1. **Neutral across assistants.** No assistant gets favoured treatment in the product or in its copy.
2. **People share on purpose.** Sharing is always explicit and can be undone. Show people what they've shared and let them take it back.
3. **Machine writing is always labelled.** Content from Orbit or an assistant is never presented as written by a person.
4. **Show conflicts; don't settle them.** Orbit lays out disagreements for the people involved to decide.
5. **Easy for the least technical member.** Connecting an assistant and joining a space must work for someone who has never added a connector.

## Accessibility & Inclusion

WCAG 2.2 AA is required in both light and dark themes. The axe-core Playwright checks (`web/tests/e2e/a11y.ts`) enforce it. Every flow must work by keyboard, and all motion must respect reduced motion.
