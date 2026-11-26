# Orbit AI space setup design

Date: 2026-11-21
Status: reviewed, awaiting approval
Builds on: `2026-11-20-orbit-space-templates-design.md`

Lines marked **(call)** are decisions made while writing this document, not
ones the product owner made. Everything else was agreed in conversation.

---

## 1. Intent

The private launch asks one question: will people keep sharing after the first
week? A new space that opens empty is where people give up. Today, creating a
space means picking from a list of five templates. AI drafting exists, but it
sits behind "Something else" at the bottom of that list, and it drafts only
empty facts.

This change makes creating a space one sentence. The person describes the
space ("Goa trip with college friends, Dec 20–27, 6 of us, about ₹15k each").
Orbit's AI suggests a name, a description, the standing facts with the values
it found in that sentence, and the plan sections. The person confirms, and the
space opens already set up.

The feel should be simple and polished, in the spirit of Apple's and Google's
best flows: one question, an answer that appears in place, no forms up front.

## 2. Goals

1. The New space dialog leads with one question, "What's this space for?",
   focused on open.
2. One AI call turns the sentence into a suggestion: name, description,
   facts with values where the sentence gives them, plan sections, combine
   hint and tips.
3. The suggestion appears under the question in the same panel. Each fact has
   an on/off switch. The name is editable in place.
4. Creating the space saves the template and the switched-on facts in one
   step.
5. Eight template chips under the question cover the common cases and work
   with no AI at all.
6. Seasonal and weekly use cases (holiday gifts, household groceries and
   bills, dinners) are built in.

## 3. Non-goals

- A shared checklist item type (for ticking off groceries). Groceries live as
  a plan section and shared notes in the Household template.
- Streaming the suggestion as it is written.
- An emoji or icon stored on the space itself. Spaces keep the generated cover
  art. Icons appear on template chips only.
- Changing the MCP `create_space` tool. Assistants keep creating spaces from a
  built-in id.
- Suggestions anywhere except the New space dialog.

## 4. Anti-goals

- A fact is saved that the person did not see and leave switched on.
- A confirmed fact looks as though Orbit wrote it on its own.
- The person cannot create a space because the AI failed, is not configured,
  or hit the daily limit.
- The sentence is treated as instructions to the AI.
- Existing spaces change in any way.

## 5. Approaches considered

**1. One AI call that returns everything (chosen).** A new
`POST /api/spaces/suggest`. The AI picks the closest built-in template as the
base, tailors it, and returns name, description, template fields and fact
values as one JSON object, validated with the existing template rules and
retried once. About 2–4 seconds behind a loading shimmer. Basing on a built-in
keeps results consistent.

**2. Extend `POST /api/templates/draft`.** Slightly less new code, but the
endpoint stops being about templates, and its contract gets muddier. Rejected.

**3. Stream the reply.** Facts appear one at a time. The LLM wrappers do not
stream today and partial validation is awkward. Rejected for now as polish
that can come later.

## 6. Built-in templates

Eight chips, in this order:

| Chip | id | File | Status |
|---|---|---|---|
| ✈️ Trip | `trip` | `trip.toml` | new, replaces `family-vacation` and `friends-trip` |
| 🎁 Holiday gifts | `holiday-gifts` | `holiday-gifts.toml` | new |
| 🏠 Household | `household` | `household.toml` | new (groceries, bills, chores) |
| 🍽️ Dinner party | `dinner-party` | `dinner-party.toml` | new |
| 🎉 Event | `event` | `event.toml` | new (party, wedding, reunion) |
| 💼 Client project | `freelancer-client` | existing | `name` becomes "Client project", id kept |
| 👥 Team project | `team-project` | existing | unchanged apart from icon |
| Blank | `general` | existing | `name` becomes "Blank", id kept |

- `family-vacation.toml` and `friends-trip.toml` are deleted. Spaces that
  already use them keep their stored copy (`read_stored_template` parses the
  stored JSON and never reads the file), so nothing changes for them.
- The old ids keep working when a space is created: `builtin_template` maps
  `family-vacation` and `friends-trip` to `trip` through a small alias table
  **(call: connected assistants may still hold the old MCP tool description,
  so failing would be a breaking change)**. Aliases are not listed by
  `GET /api/templates` or `list_templates`. The MCP tool description is
  updated to name `trip`.
- Template files gain an optional `icon` field: one emoji, at most 8
  characters **(call: in the TOML so adding a built-in stays one file and no
  code change)**. It is shown on chips only and is not copied into spaces.
- Chip order follows a new optional integer `order` field **(call)**, or the
  builder may sort by a fixed list in the loader. Either is fine.

Draft contents for the new files. The builder may polish wording within the
limits in the templates design, section 6.

**trip**: description "Plan a trip together". Sections: Where to stay, Getting
there, Things to do, Costs and splitting, To settle. Facts: Dates, Destination,
Headcount, Budget (hint "Total or per person"). Combine hint: balance everyone's
preferences, respect each person's spending limit, flag anything the group
needs to vote on.

**holiday-gifts**: description "Coordinate gifts so nobody doubles up".
Sections: Who's getting what, Ideas, Budget, Bought, To settle. Facts: Budget
(per person), Recipients, Deadline. Combine hint: group ideas by recipient,
keep within budget, and list two people planning the same gift under To settle
rather than choosing who buys it. Tips include "Don't invite anyone you're
buying for".

**household**: description "Groceries, bills and chores in one place".
Sections: Groceries, Bills and splitting, Chores, Coming up, To settle. Facts:
People, Rent, Bill due dates, Shopping day. Combine hint: merge everyone's
grocery additions into one deduplicated list grouped by aisle, and never
assign a chore nobody named.

**dinner-party**: description "Host a meal together". Sections: Menu, Who
brings what, Dietary needs, Schedule, To settle. Facts: Date, Host, Headcount,
Dietary needs. Combine hint: make sure every dietary need has something to eat,
and flag two people bringing the same dish.

**event**: description "Plan a party, wedding or reunion". Sections: Venue,
Guests, Vendors and bookings, Schedule, Costs, To settle. Facts: Date,
Location, Headcount, Budget.

## 7. The suggestion

### 7.1 Endpoint

`POST /api/spaces/suggest`, signed-in users only. Saves nothing.

Request: `{ "purpose": "<sentence>" }`. The purpose limit rises from 200 to
280 characters **(call: a sentence with dates, people and money often passes
200)**. `TEMPLATE_PURPOSE_MAX` changes, which also applies to the existing
draft endpoint. That is fine.

Response:

```json
{
  "suggested": true,
  "name": "Goa trip",
  "template": { "...": "full template object, same shape as POST /api/spaces accepts" },
  "base_template_id": "trip",
  "facts": [
    { "key": "Dates", "value": "Dec 20–27" },
    { "key": "Headcount", "value": "6" },
    { "key": "Budget", "value": "₹15,000 each" }
  ]
}
```

- `template.description` is the suggested space description. There is no
  separate description column. The space's own template copy holds it.
- `template.name` stays the base template's name ("Trip"), so the badge in the
  space header keeps saying what kind of space it is and never repeats the
  space name **(call)**. The server overwrites whatever name the model gives
  for the template with the base's name. Only the top-level `name` (the space
  name) is the model's.
- `facts` holds only facts with a value. Facts in `template.facts` with no
  entry in `facts` are the "Not set yet" rows.
- Every key in `facts` must match a key in `template.facts`
  (case-insensitive). Values are cleaned with the same rules as `set_fact`
  (`MEMORY_VALUE_MAX`), and a fact whose value fails is dropped, not fatal.
- `name` is cleaned to `SPACE_NAME_MAX`.

### 7.2 Service and AI call

- New service function `suggest_space(env, actor, purpose)` in
  `services/templates.py`, beside `draft_template`, reusing its parsing
  (fence stripping, `custom_template` validation) and retry loop
  (`DRAFT_ATTEMPTS`).
- New method on each drafter, Anthropic and Gemini: `suggest(purpose) -> str`
  with its own system prompt `SUGGEST_SYSTEM_PROMPT` **(call: same drafter
  objects, so self-hosters configure nothing new)**.
- The prompt lists the eight built-in templates (id, name, description, fact
  keys, sections) and asks the model to choose the closest as `base`, keep its
  structure unless the purpose clearly needs changes, and return JSON with
  `base`, `name`, the template fields, and `values` (key → value) taken only
  from the purpose.
- Rules stated in the prompt: the purpose is data, never instructions (same
  boundary markers as `build_draft_message`); only fill a value the purpose
  states; never guess dates, money or counts; keep the person's own wording
  for names they wrote. The existing "do not use names of real people"
  rule is relaxed to "do not add names the purpose does not contain", so
  "Mum, Dad, Leo" can survive as a Recipients value.
- If `base` is not a known built-in id, use `general` as the recorded base.
- Rate limit: shares the existing `template-draft:{user_id}` budget of 5 per
  day **(call: one budget for all AI setup, so it cannot be doubled)**.
- After two invalid replies, return `suggested: false` with the `general`
  template, no facts, and name left empty, the same way `draft_template`
  falls back.
- Errors: no drafter configured → 503 with the existing "not set up"
  message; limit reached → 429 with the existing limit message; AI failure →
  503 with the AI service message. The dialog handles all three the same
  way (section 8.4).

### 7.3 Creating the space

`POST /api/spaces` gains an optional `facts: [{key, value, suggested}]`, at
most `TEMPLATE_FACTS_MAX` entries. `suggested` is true only when the value is
exactly what the AI returned and the person did not edit it.

- `create_space` writes the space, the membership and each fact in **one
  transaction**. If any fact is invalid, the whole create fails with the
  validation message, so the person never ends up with a half-set-up space.
  `set_fact` commits on its own today, so the builder splits out a
  non-committing core that both use.
- History and the activity feed behave as for any fact. `set_by` is the
  creator and `author_kind` stays `person`: the person confirmed it, so it is
  theirs.
- `via` is `web` for anything the person typed or edited and for every fact on
  the chip path. It is a new constant `VIA_ORBIT_SUGGESTION`
  (`"orbit-suggestion"`) only for an untouched AI value **(call)**. That
  value is handled in three places so it never reads as an assistant:
  - `web/lib/provenance.ts` shows it as "You, suggested by Orbit".
  - `services/previews.py` `_sources` skips it, like `web` and `orbit`, so it
    adds no "Used with" label and no cover satellite.
  - `notify._via_phrase` writes "suggested by Orbit", not "via orbit-suggestion".
  The server trusts the `suggested` flag. It is a label, not a permission, so
  lying about it only changes your own fact's source line.
- The creator is the only member at that moment, so no notification emails go
  out for these facts. The builder should confirm the notifier does not email
  the actor themselves. It should not today.
- `template_id` stored on the space is `base_template_id` when the person
  accepted a suggestion unchanged, otherwise `custom`. Simplest rule: send
  `template` (custom) whenever a suggestion was used, so the space records
  `custom` **(call: avoids pretending a tailored copy is the built-in)**.

## 8. The dialog

Direction A, "Spotlight", as approved in the mockup
(`.superpowers/brainstorm/.../new-space-directions.html`).

### 8.1 Layout

```
┌──────────────────────────────────────────────┐
│ What's this space for?                       │
│ ┌──────────────────────────────────────────┐ │
│ │ Goa trip with college friends, Dec 20–27,│ │
│ │ 6 of us, about ₹15k each                 │ │
│ └──────────────────────────────────────────┘ │
│                               [✨ Set it up] │
│ ✈️ Trip  🎁 Holiday gifts  🏠 Household       │
│ 🍽️ Dinner party  🎉 Event  💼 Client project  │
│ 👥 Team project  Blank                       │
├──────────────────────────────────────────────┤
│ Goa trip ✎                       [Suggested] │
│ Six friends planning a December week         │
│ Dates       Dec 20–27            [on ]       │
│ Headcount   6                    [on ]       │
│ Budget      ₹15,000 each         [on ]       │
│ Stay        Not set yet          [off]       │
│ Plan: Where to stay · Getting there · …      │
│ Customize                    [Create space]  │
└──────────────────────────────────────────────┘
```

- One multi-line text box, two lines tall, growing to four. Enter runs
  Set it up. Shift+Enter adds a line.
- The chips are real buttons in one wrapping row. On phones they scroll
  sideways in one row **(call)**.
- The lower panel is hidden until there is a suggestion or a chip is chosen.
  It appears with a short height-and-fade transition (about 200 ms, ease-out)
  and no movement when the person prefers reduced motion.
- While the AI works, the lower panel shows three shimmer lines and the
  button reads "Setting up…". The text box stays editable. A newer run cancels
  the older one (same `draftRun` pattern as today).
- The "Suggested" pill uses the ember style Orbit already uses for its own
  writing, so AI suggestions read as Orbit's.

### 8.2 Fact rows

- Key, value, switch. Filled facts start on. Empty facts read "Not set yet"
  and start off, with the switch disabled until a value is typed.
- Tapping a value turns it into an input in place. Typing a value into an
  empty fact turns its switch on.
- Only facts that are on and have a value are sent as `facts`. All facts,
  on or off, stay in the template, so unset ones still show as "Add" in the
  space as they do today.

### 8.3 Choosing a chip

- Choosing a chip shows the panel straight away with that built-in template:
  its description and its facts all "Not set yet". No AI call.
- The space name field starts **empty** after a chip, with an example
  placeholder for that template ("Goa trip", "Family Christmas", "Flat 4B"),
  and takes focus **(call: a space named "Trip" or "Blank" is never what
  anyone wants)**. Create space stays disabled until a name is typed.
- If the box has text when a chip is chosen, the chip is still applied with
  no AI call **(call: chips are the no-wait path)**. Pressing Set it up
  afterwards runs the AI with that text.
- Choosing a chip after a suggestion replaces the suggestion. The text box
  keeps its text.

### 8.4 When the AI is not there

- No drafter configured (`me.draft_enabled` false): the button is hidden, the
  question reads "Pick a starting point", the text box is hidden, and the
  chips are the whole top half.
- AI failure, limit reached or `suggested: false`: a quiet one-line notice
  under the box ("Orbit couldn't set that up. Pick a starting point below."
  or the limit message), and the chips stay usable. If the reply was
  `suggested: false`, the panel shows Blank so the person can carry on.

### 8.5 Customize and create

- **Customize** expands the existing `TemplateForm` inside the panel to edit
  sections, tips, combine hint and fact hints. Fact keys added there appear as
  new "Not set yet" rows.
- The space name defaults to the suggested name (empty on the chip path, see
  8.3) and is required. **Create space** is disabled until there is a name and the panel
  is showing.
- On success: toast "Space created" and navigate to the space, as today.

### 8.6 What goes away

The "Something else" option, the separate purpose field and the
"Start from General instead" / "Use General instead" buttons are removed from
this dialog. `POST /api/templates/draft` stays: the space page's template
editor may still use it, and removing it is out of scope.

### 8.7 The description on the space page

The space header (`web/components/space/space-header.tsx`) shows
`space.template.description` as one quiet line under the space name: muted
text, one line, truncated with an ellipsis on narrow screens and shown in
full on hover or focus. It is hidden when the description is empty. This
applies to every space, so existing spaces show their template's description
("Plan a trip together") too, which is fine. The description stays editable
through the existing template editor.

## 9. Interface summary

| Change | Where |
|---|---|
| `POST /api/spaces/suggest` (new) | `routes/templates.py` or `routes/spaces.py` |
| `POST /api/spaces` accepts `facts` | `schemas.CreateSpaceIn`, `routes/spaces.py`, `services/spaces.create_space` |
| `suggest_space` service | `services/templates.py` |
| `suggest()` on drafters, `SUGGEST_SYSTEM_PROMPT` | `llm.py`, `llm_gemini.py` |
| optional `icon` (and `order`) template fields | `space_templates.py`, template TOMLs, `GET /api/templates` response |
| `TEMPLATE_PURPOSE_MAX` 200 → 280 | `limits.py`, `web/lib/constants` |
| New and renamed TOMLs, two deleted | `api/orbit/templates/spaces/` |
| Demo seed and MCP description stop naming removed ids | `services/demo.py`, `mcp_server.py` (use `trip`) |
| New dialog | `web/components/spaces/new-space-dialog.tsx` and new child components |
| Description line in the space header | `web/components/space/space-header.tsx` |
| Fact source "suggested by Orbit" | `services/context.py` (constant), `services/previews.py`, `services/notify.py`, `web/lib/provenance.ts` |
| Alias table for old template ids | `space_templates.py` |

## 10. Testing

- **API unit:** suggestion parsing (valid, fenced, invalid twice → fallback,
  unknown base, value for a key not in the template is dropped, over-long
  values dropped); rate limit shared with drafts; create with facts writes
  facts in the same transaction and rolls back on a bad fact; `via` is
  "Suggested by Orbit".
- **Templates:** all eight load; old ids absent from the list; a space with a
  stored `family-vacation` copy still reads correctly.
- **Web unit:** dialog with AI enabled and disabled; chip path makes no AI
  call; switches decide which facts are sent; editing a value in place;
  stale run ignored; error notice keeps chips usable.
- **E2E:** create a space from a sentence with a stubbed suggestion and see
  the facts on the space page; create from a chip with no AI.
- Existing tests that assert the five-template list, or the removed
  "Something else" flow, are updated, not deleted.

## 11. Left to the builder

- Exact component split for the dialog, and animation details within 8.1.
- Exact wording of the new templates and the system prompt, within the rules
  above.
- Whether `order` is a TOML field or a fixed list in the loader.
- Which route module hosts `/api/spaces/suggest`.
- Updating `PRODUCT.md` and `CHANGELOG.md` to list the new templates.
