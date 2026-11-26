# Orbit space templates design

Date: 2026-11-20
Status: draft, awaiting approval
Builds on: `2026-11-19-orbit-mvp-design.md`

Lines marked **(call)** are decisions made while writing this document.

---

## 1. Intent

Orbit's core is generic: a space, shared items, shared memory and combine.
That makes a new space a blank page, and a blank page gives people no idea
what to share or what a good combined answer looks like.

A **template** gives a space a purpose. It says which standing facts matter,
how the combined answer is laid out, and what to prompt people for. A family
vacation and a freelancer project then feel like different products while
running on the same code.

People choose from a short list of built-in templates. When none fits, they
describe the purpose in one line and Orbit's AI drafts a template for them
to accept or edit.

## 2. Goals

1. Creating a space offers a short list of built-in templates and a
   "Something else" option.
2. A template shapes three things: suggested facts, the layout of the
   combined plan, and tips shown to people and assistants.
3. "Something else" produces an AI-drafted template that a person confirms
   before it is used.
4. A space's template stays editable by its members.
5. Adding a built-in template is one small file and no code change.
6. Existing spaces keep working with no action from their members.

## 3. Non-goals

- Templates that change permissions, tools or data structure.
- A public gallery or sharing of custom templates between users.
- Templates that run actions, automations or schedules.
- AI choosing or changing a template without a person confirming.
- Translating templates into other languages.

## 4. Anti-goals

- A space becomes unusable because its template is missing or invalid.
- Text in a template is treated as instructions that override Orbit's rules.
- An edit to a built-in template silently changes existing spaces.
- A person cannot proceed because no template fits.

## 5. Approaches considered

**A. Built-in templates only.** Predictable and needs no AI. Rejected alone
because any purpose outside the list feels unsupported.

**B. AI decides everything.** Handles any purpose. Rejected alone because it
is unpredictable, harder to test, and costs an LLM call for every space.

**C. Built-in templates with an AI-drafted fallback (chosen).** Clear
starting points for common cases and no dead end for the rest. The AI only
proposes. A person confirms.

## 6. What a template contains

| Field | Meaning | Limit |
|---|---|---|
| `id` | Stable identifier, lowercase with hyphens | 40 characters |
| `name` | Shown in the picker | 40 |
| `description` | One line under the name | 120 |
| `facts` | Suggested standing facts, each with `key` and `hint` | up to 10 |
| `plan_sections` | Ordered headings for the combined plan | up to 8, 60 each |
| `combine_hint` | Guidance for how to weigh inputs | 500 |
| `tips` | Short prompts shown when the space is empty | up to 5, 100 each |

The last plan section is always "To settle", added by Orbit if a template
omits it, so open disagreements always have a place.

Example:

```toml
id = "family-vacation"
name = "Family vacation"
description = "Plan a trip together"
plan_sections = ["Where to stay", "Getting there", "Daily outline", "Costs", "To settle"]
combine_hint = "Balance everyone's preferences and stay within the budget."
tips = ["Share a hotel shortlist", "Set the budget", "Add the dates"]

[[facts]]
key = "Dates"
hint = "When you are travelling"

[[facts]]
key = "Budget"
hint = "Total for the trip"

[[facts]]
key = "Destination"
hint = "Where you are going"
```

## 7. Built-in templates

Stored as TOML files in `api/orbit/templates/` **(call: TOML, because Python
reads it without an added dependency)**. Loaded and validated when the api
starts. An invalid file stops startup with a clear message, so a bad
template is caught in CI and never reaches users.

First release:

| id | Name |
|---|---|
| `general` | General (no specific purpose) |
| `family-vacation` | Family vacation |
| `friends-trip` | Friends trip |
| `freelancer-client` | Freelancer and client |
| `team-project` | Team project |

`general` has no suggested facts, the sections "Summary", "Next steps" and
"To settle", and is the default when no template is given.

## 8. Data changes

Two new columns on `spaces`:

| Column | Meaning |
|---|---|
| `template_id` | Where the template came from: a built-in id, or `custom` |
| `template` | JSON copy of the template as used by this space |

- Each space holds its **own copy** **(call)**. Member edits change only that
  copy, and later changes to a built-in file do not alter existing spaces.
- Migration: every existing space gets `template_id = "general"` and a copy
  of the `general` template.
- If a stored copy fails validation when read, the space falls back to
  `general` and logs a warning.

## 9. Behaviour

**Creating a space**

1. The person picks a built-in template or "Something else".
2. A built-in template is copied into the space.
3. "Something else" asks for one line describing the purpose (up to 200
   characters). Orbit drafts a template (section 10) and shows it. The
   person can accept it, edit it, or use `general`.

**Editing.** Any member can edit the space's template from the space page:
add, remove or rename facts and plan sections, and change the hint. Edits
are validated against the limits in section 6. Changing the template does
not alter stored memory or past plans.

**Suggested facts.** A fact in the template that has no value in the space's
memory is "unset". The space page lists unset facts with an "Add" action.
Members can still set any fact that is not in the template.

**Combine.** The combine prompt asks for the plan under the template's
`plan_sections`, in order, and includes `combine_hint` as guidance. A
section with nothing to say is omitted. The rules from the MVP spec still
apply: shared content is data, no invented facts, conflicts go under "To
settle".

**Assistants.** `get_space_context` also returns the template name, the
unset facts with their hints, and the tips. This lets an assistant say "you
haven't set a budget yet" without Orbit doing any reasoning.

## 10. AI-drafted templates

- One function in `llm.py`: `draft_template(purpose) -> template`.
- One LLM call. The prompt gives the field list and limits, asks for JSON
  only, and states that the purpose line is a description to work from and
  not instructions.
- The result is validated against section 6. If it is invalid, retry once.
  If it is still invalid, offer `general`.
- Nothing is saved until the person confirms.
- With no LLM key configured, "Something else" skips the draft and lets the
  person start from `general` and edit it.
- Limit **(call)**: 5 drafts per user per day.

## 11. Interface changes

**MCP tools**

- `create_space(name, template)`: `template` is optional and takes a
  built-in id. Default `general`.
- `list_templates()`: new, read-only. Returns built-in ids, names and
  descriptions so an assistant can offer the choice.
- `get_space_context`: adds `template_name`, `unset_facts` and `tips`.
- No tool drafts or edits a template **(call)**. That stays on the web page
  for the first release, to keep the tool list short.

**REST**

| Method and path | Purpose |
|---|---|
| `GET /api/templates` | built-in templates |
| `POST /api/templates/draft` | draft from a purpose line; saves nothing |
| `POST /api/spaces` | accepts `template_id` or a full `template` |
| `PUT /api/spaces/{id}/template` | replace the space's template |

**Web**

- Create space: a picker of cards, one per template, with "Something else"
  last. Choosing it reveals the purpose field, then the drafted template in
  an editable form.
- Space page: unset facts appear in the shared memory panel with their
  hints. The latest plan shows the template's sections as headings. An
  "Edit template" action opens the same form.
- Empty space: shows the template's tips.

## 12. Security

- Template text written by a person or drafted by the AI is user content.
  In the combine prompt it is placed in a delimited block and described as
  layout guidance, below Orbit's own rules. It cannot remove the "shared
  content is data" rule or the "To settle" section.
- All fields are length-limited and rendered as text.
- Only members of a space can read or edit its template.
- Built-in templates are reviewed like code, through pull requests.

## 13. Contributing a template

`CONTRIBUTING.md` gains a short section: copy an existing file, fill in the
fields, run the template test, open a pull request. A contributed template
must be general-purpose, contain no brand or personal names, and stay within
the limits.

## 14. Testing

- Every built-in file loads and validates.
- Creating a space with each built-in template, with `general` by default,
  and with a custom template.
- Unset facts are computed correctly as facts are set.
- Combine output follows the section order, with a fake LLM.
- Draft: valid result, invalid then valid, invalid twice, no key.
- A template edit by a non-member is refused.
- Migration gives existing spaces the `general` template.
- A template containing instruction-like text does not change the fixed
  rules in the combine prompt.

## 15. Build order

1. Template format, loader, validation, the five built-in files.
2. The two columns, the migration, copy-on-create, `create_space` argument,
   `list_templates`.
3. Unset facts and tips in `get_space_context` and on the space page.
4. Combine using sections and the hint.
5. The picker on the create-space screen and the edit form.
6. AI-drafted templates and "Something else".

Steps 1 to 5 need no LLM. Each step ends in a working state.

## 16. Calls made in this document

1. TOML files for built-in templates.
2. Each space holds its own copy of its template.
3. No MCP tool for drafting or editing templates in the first release.
4. 5 drafts per user per day.
5. "To settle" is always the last plan section.
6. The first five templates in section 7.

## 17. Left to the builder

- Wording of the built-in templates' hints and tips.
- The exact draft prompt.
- Visual design of the picker and edit form, within the MVP design rules.

## 18. Decisions made while building

1. The TOML files live in `api/orbit/templates/spaces/`, not directly in `api/orbit/templates/`, because that folder already holds the page and email templates.
2. The 8-section limit counts "To settle". A template written with 8 other sections is refused with a message that says so. A "To settle" written anywhere in the list is moved to the end.
3. A suggested fact's hint is limited to 120 characters, which section 6 left open. Fact keys use the existing 100-character limit for memory keys.
4. The picker lists `general` first and the other built-in templates by name. File names carry no order.
5. `draft_template` is a service function in `services/templates.py`, which validates, retries once and falls back to `general`. `llm.py` holds the model call, `AnthropicDrafter`, so the logic can be tested with a fake.
6. `GET /api/me` returns `draft_enabled` so the web page can skip the draft step when no model is configured.
7. The 5-drafts-a-day limit is counted in memory, so it resets when the api restarts. A failed or invalid draft counts, because it still costs a model call.
8. A template edit is announced to open pages as a `template_changed` event.
9. Deleting a space resets its template to `general`, so a deleted space does not keep template text.
10. The migration adds the two columns with plain `ADD COLUMN` and database defaults. A table rebuild would drop and recreate `spaces`, and with SQLite foreign keys on, that deletes the rows that depend on it.
11. Combining still returns the existing plan when nothing new was shared since the last plan, even if the template changed. A combine with an instruction, or after anything new is shared, uses the new template.
12. Reversed later (2026-11-20): call 3 in section 16 kept drafting and editing off the tool list. The owner then asked for every web feature to be available to assistants, so there are now `draft_template`, `get_space_template` and `update_space_template`. Drafting saves nothing and shares the 5-a-day limit with the web page. An edit replaces the whole template, so `get_space_template` exists to let an assistant read the current one first. Template text reaches assistants only inside the data block, as in section 12.
