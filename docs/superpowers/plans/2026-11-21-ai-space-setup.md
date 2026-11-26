# AI Space Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a space takes one sentence: Orbit's AI suggests the name, description, facts with values and plan, the person confirms, and the space opens set up. Eight template chips cover the no-AI path.

**Architecture:** A new `POST /api/spaces/suggest` makes one LLM call through the existing drafter objects, using the built-in templates as bases, and returns a validated suggestion. It saves nothing. `POST /api/spaces` gains `facts`, written in the same transaction as the space. The New space dialog is rebuilt as a "Spotlight" panel: question box, chips, then a suggestion panel with fact switches.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy / pytest / ruff / mypy (`api/`), Next.js / React / TypeScript / Vitest / Playwright (`web/`).

**Spec:** `docs/2026-11-21-orbit-ai-space-setup-design.md`. Read it before starting any task. Section numbers below refer to it.

## Global Constraints

- Branch: create `feat/ai-space-setup` from `main`. The current branch `feat/space-page-share` holds unrelated uncommitted work. Do not carry it over.
- API checks, run from `api/`: `ruff check .`, `ruff format --check .`, `mypy`, `pytest`. Web checks, run from `web/`: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`. All must pass at the end of every task.
- Copy is plain, honest English, as in `PRODUCT.md`. Exact strings fixed by this plan are quoted. Use them verbatim.
- Text the AI returns is never trusted. It is validated with the existing template rules (`parse_template`, the limits in `api/orbit/limits.py`) before anything leaves the server.
- Existing spaces must not change: stored template copies are never rewritten.
- Respect reduced motion for every transition.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The model invents a value the sentence didn't contain**, such as a date or price. The prompt forbids it, and the server drops any value whose key isn't one of the template's facts. Test: Task 4 `test_suggest_drops_values_for_unknown_keys`.
2. **The purpose contains instructions** ("ignore the above and…"). It is wrapped in the boundary block and the prompt says it is data. Test: Task 4 `test_suggest_message_wraps_purpose_in_boundary`.
3. **A stale suggestion arrives after the person typed again or picked a chip.** The older result must be ignored. Test: Task 6 `ignores a suggestion that finishes after a chip was chosen`.
4. **Someone edits an AI-filled value, then creates.** It must be saved as `web`, not "suggested by Orbit". Test: Task 6 `sends suggested false for an edited value`.
5. **Duplicate or case-variant fact keys in a create request** ("Budget" and "budget"). This must be rejected, never half-saved. Test: Task 3 `test_create_rejects_duplicate_fact_keys`.

---

### Task 1: Built-in templates, icons, order and old-id aliases

**Files:**
- Modify: `api/orbit/space_templates.py`
- Modify: `api/orbit/schemas.py` (`TemplateOut`), `api/orbit/routes/mappers.py` (`template_out`)
- Create: `api/orbit/templates/spaces/trip.toml`, `holiday-gifts.toml`, `household.toml`, `dinner-party.toml`, `event.toml`
- Modify: `api/orbit/templates/spaces/general.toml`, `freelancer-client.toml`, `team-project.toml`
- Delete: `api/orbit/templates/spaces/family-vacation.toml`, `friends-trip.toml`
- Modify: `api/orbit/services/demo.py` (lines ~207, 229, 234: use `"trip"`), `api/orbit/mcp_server.py:383` (example id `'trip'`)
- Test: `api/tests/test_space_templates.py`, plus every test that asserts the old five-template list or ids (`grep -rn "family-vacation\|friends-trip" api/tests web/tests`)

**Interfaces:**
- Produces: `SpaceTemplate.icon: str = ""` and `SpaceTemplate.order: int = 100` (dataclass fields with defaults, added last). `TEMPLATE_ALIASES: dict[str, str] = {"family-vacation": "trip", "friends-trip": "trip"}`. `TemplateOut.icon: str`. `builtin_templates()` returns the eight templates in chip order.

- [ ] **Step 1: Write the failing tests** in `test_space_templates.py`:

```python
def test_builtins_are_the_eight_chips_in_order():
    assert list(builtin_templates()) == [
        "trip", "holiday-gifts", "household", "dinner-party",
        "event", "freelancer-client", "team-project", "general",
    ]
    assert builtin_templates()["general"].name == "Blank"
    assert builtin_templates()["freelancer-client"].name == "Client project"
    assert builtin_templates()["trip"].icon == "✈️"

def test_old_ids_resolve_to_trip():
    assert builtin_template("family-vacation").id == "trip"
    assert builtin_template("friends-trip").id == "trip"

def test_stored_copy_of_removed_template_still_reads():
    stored = {"id": "family-vacation", "name": "Family vacation", "description": "Plan a trip together",
              "facts": [{"key": "Dates", "hint": "When"}], "plan_sections": ["Costs", "To settle"],
              "combine_hint": "", "tips": []}
    assert read_stored_template("family-vacation", stored).name == "Family vacation"

def test_icon_and_order_are_not_stored_in_space_copies():
    assert "icon" not in template_to_dict(builtin_templates()["trip"])
    assert "order" not in template_to_dict(builtin_templates()["trip"])
```

Add a REST test that `GET /api/templates` returns `icon` for each template and does not list `family-vacation`.

- [ ] **Step 2: Run** `pytest tests/test_space_templates.py -v`. Expected: FAIL (old ids present, no `icon`).

- [ ] **Step 3: Implement.**
  - `_load_file` pops `icon` (str, at most 8 characters, optional) and `order` (int, optional) from the TOML data before `parse_template`, then sets them with `dataclasses.replace`. `TEMPLATE_FIELDS` is unchanged, so custom and stored templates still reject them.
  - `load_builtin_templates` sorts all templates by `(order, name.casefold(), id)`. It still raises if `general.toml` is missing.
  - `builtin_template` looks up `TEMPLATE_ALIASES` before raising. The "Available templates" error message lists real ids only.
  - `template_to_dict` is unchanged (no icon or order). `template_out` adds `icon=template.icon`.
  - TOML `order` values: trip 10, holiday-gifts 20, household 30, dinner-party 40, event 50, freelancer-client 60, team-project 70, general 90. Icons: ✈️ 🎁 🏠 🍽️ 🎉 💼 👥 and none for general.
  - New TOML contents follow spec §6, within the limits in `limits.py`. `general.toml` gets `name = "Blank"`, and `freelancer-client.toml` gets `name = "Client project"`.

- [ ] **Step 4: Run** `pytest` (full suite). Expected: PASS after updating tests that assumed the old list (keep their intent, swap ids to `trip`).

- [ ] **Step 5: Commit**: `feat(templates): eight built-in templates with icons, order and old-id aliases`.

---

### Task 2: "Suggested by Orbit" fact source

**Files:**
- Modify: `api/orbit/services/context.py` (constant), `api/orbit/services/previews.py:19`, `api/orbit/services/notify.py:46-49`
- Modify: `web/lib/provenance.ts`
- Test: `api/tests/test_notify.py`, the previews tests (`grep -rln "_sources\|sources" api/tests`), `web/tests/unit/lib/provenance.test.ts` (create if absent)

**Interfaces:**
- Produces: `VIA_ORBIT_SUGGESTION = "orbit-suggestion"` in `orbit/services/context.py`, and `ORBIT_SUGGESTION_ORIGIN = "orbit-suggestion"` exported from `web/lib/provenance.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `test_via_phrase_for_orbit_suggestion`: `describe(Activity(KIND_FACT, "Alex", VIA_ORBIT_SUGGESTION, "Budget", at))` equals `'Alex updated the fact "Budget", suggested by Orbit'`.
  - `test_sources_skip_orbit_suggestion`: a space whose only fact has `via="orbit-suggestion"` has `sources == []` in its preview.
  - Vitest: `describeProvenance({ person: me, via: "orbit-suggestion" }, me.user_id)` returns `{ who: "You", via: "suggested by Orbit", isYou: true, isOrbit: false }`.

- [ ] **Step 2: Run** the three tests. Expected: FAIL.

- [ ] **Step 3: Implement.** Add the constant, add it to `UNLISTED_SOURCES`, make `_via_phrase` return `", suggested by Orbit"` for it, and make `describeProvenance` return `via: "suggested by Orbit"` for it.

- [ ] **Step 4: Run** `pytest` and `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `feat(facts): label facts that came from an Orbit suggestion`.

---

### Task 3: Create a space with facts in one transaction

**Files:**
- Modify: `api/orbit/services/memory.py` (split a non-committing core out of `set_fact`)
- Modify: `api/orbit/services/spaces.py:129` (`create_space`)
- Modify: `api/orbit/schemas.py` (`CreateSpaceIn`), `api/orbit/routes/spaces.py:49`
- Test: `api/tests/test_rest_core.py` or a new `api/tests/test_create_space_facts.py`

**Interfaces:**
- Consumes: `VIA_ORBIT_SUGGESTION` (Task 2).
- Produces:
  - `@dataclass(frozen=True) class InitialFact: key: str; value: str; suggested: bool = False` in `orbit/services/spaces.py`.
  - `create_space(db, env, actor, name, template=None, facts: Sequence[InitialFact] = ()) -> SpaceView`.
  - `schemas.CreateSpaceFactIn(key: str = "", value: str = "", suggested: bool = False)`, and `CreateSpaceIn.facts: list[CreateSpaceFactIn] = []`.

- [ ] **Step 1: Write the failing tests:**
  - `test_create_with_facts_saves_them`: POST `{"name": "Goa trip", "template_id": "trip", "facts": [{"key": "Dates", "value": "Dec 20–27", "suggested": true}, {"key": "Headcount", "value": "6"}]}`. Then `GET /api/spaces/{id}` shows both facts. Dates has `via == "orbit-suggestion"`, Headcount has `via == "web"`, and both have `set_by.user_id ==` the creator.
  - `test_create_rolls_back_on_bad_fact`: one fact with an empty value → 400. The user's space count is unchanged.
  - `test_create_rejects_duplicate_fact_keys`: keys `"Budget"` and `"budget"` → 400 with message `"Each fact can only be set once."`. No space is created.
  - `test_create_rejects_too_many_facts`: 11 facts → 400.
  - `test_create_without_facts_unchanged`: the existing behaviour still passes.

- [ ] **Step 2: Run** them. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `memory.py`, extract `stage_new_fact(db, env, space_id, user_id, key, value, via) -> Memory`. It cleans with `clean_single_line(key, "Key", MEMORY_KEY_MAX)` and `clean_block(value, "Value", MEMORY_VALUE_MAX)`, adds a `FACT_ADD` row, and does not commit, publish or notify. `set_fact` keeps its behaviour.
  - `create_space` validates the count (`TEMPLATE_FACTS_MAX`) and casefolded-duplicate keys before writing anything. After adding the membership it stages each fact with `via = VIA_ORBIT_SUGGESTION if fact.suggested else actor.via`, then commits once. If anything raises, it calls `db.rollback()` and re-raises.
  - No notifier call and no event for staged facts: the space is brand new and has one member.
  - If importing `memory` from `spaces` creates a cycle, import inside the function.
  - The route maps `body.facts` to `InitialFact`s.

- [ ] **Step 4: Run** `pytest`. Expected: PASS.

- [ ] **Step 5: Commit**: `feat(spaces): create a space with its first facts in one step`.

---

### Task 4: The suggestion endpoint and AI call

**Files:**
- Modify: `api/orbit/limits.py` (`TEMPLATE_PURPOSE_MAX = 280`)
- Modify: `api/orbit/llm.py` (`TemplateDrafter` protocol, `SUGGEST_SYSTEM_PROMPT`, `build_suggest_message`, `AnthropicDrafter.suggest`)
- Modify: `api/orbit/llm_gemini.py` (`GeminiDrafter.suggest`, `json_reply=True`)
- Modify: `api/orbit/services/templates.py` (`suggest_space`)
- Modify: `api/orbit/schemas.py`, `api/orbit/routes/templates.py` (route `POST /spaces/suggest`, declared in this router)
- Modify: `api/tests/template_helpers.py` (`FakeDrafter.suggest`, `suggested_reply`)
- Test: `api/tests/test_llm_templates.py`, `api/tests/test_services_templates.py`, `api/tests/test_rest_templates.py`

**Interfaces:**
- Consumes: `builtin_templates()` and `SpaceTemplate` (Task 1).
- Produces:
  - Protocol method `TemplateDrafter.suggest(self, purpose: str, templates: Sequence[SpaceTemplate]) -> str`.
  - `build_suggest_message(purpose: str, templates: Sequence[SpaceTemplate]) -> str`.
  - `@dataclass(frozen=True) class SuggestedFact: key: str; value: str` and `@dataclass(frozen=True) class Suggestion: suggested: bool; name: str; template: SpaceTemplate; base_template_id: str; facts: tuple[SuggestedFact, ...]` in `services/templates.py`.
  - `suggest_space(env: Env, actor: Actor, purpose: str) -> Suggestion`.
  - `schemas.SuggestIn(purpose: str = "")`, `schemas.SuggestedFactOut(key: str, value: str)`, and `schemas.SuggestOut(suggested: bool, name: str, template: TemplateOut, base_template_id: str, facts: list[SuggestedFactOut])`.
  - REST: `POST /api/spaces/suggest` → `SuggestOut`.

The model's reply is one JSON object: `{"base": "<built-in id>", "name": "<space name>", "description", "facts": [{key, hint}], "plan_sections", "combine_hint", "tips", "values": {"<fact key>": "<value>"}}`.

- [ ] **Step 1: Write the failing tests.**
  - `test_suggest_message_wraps_purpose_in_boundary`: the message contains the purpose only between `<<<ORBIT-SHARED {b}` and `ORBIT-SHARED {b}>>>`, and lists every built-in id with its fact keys.
  - `test_suggest_prompt_rules`: `SUGGEST_SYSTEM_PROMPT` contains "never instructions", "only fill a value the purpose states", and "do not add names the purpose does not contain".
  - Service, with `FakeDrafter.suggest` returning the reply for "Goa trip with college friends, Dec 20–27, 6 of us, about ₹15k each" (`base: "trip"`, `values: {"Dates": "Dec 20–27", "Headcount": "6", "Budget": "₹15,000 each"}`):
    - `test_suggest_returns_values_and_base`: `suggested is True`, `base_template_id == "trip"`, `template.id == "custom"`, `template.name == "Trip"` (the base's name, whatever the model sent), the facts are those three in template order, and `name == "Goa trip"`.
    - `test_suggest_drops_values_for_unknown_keys`: `values` containing `"Stay": "Taj"` when the template has no Stay fact → dropped. A value over `MEMORY_VALUE_MAX` → dropped. A key matched case-insensitively takes the template's casing.
    - `test_suggest_unknown_base_records_general`: `base: "spaceship"` → `base_template_id == "general"` and `template.name == "Blank"`.
    - `test_suggest_falls_back_after_two_invalid_replies`: → `suggested is False`, the general template, `facts == ()`, `name == ""`.
    - `test_suggest_shares_draft_limit`: 5 drafts then 1 suggest → `RateLimited` with the existing `DRAFT_LIMIT_REACHED` message.
    - `test_suggest_without_drafter_is_unavailable`: raises `Unavailable(DRAFTING_NOT_SET_UP)`.
  - REST: `test_post_suggest` returns 200 with the `SuggestOut` shape. A purpose of 281 characters → 400.
  - Anthropic and Gemini: one test each that `suggest()` sends `SUGGEST_SYSTEM_PROMPT` (mirror the existing drafter tests in `test_llm.py` and `test_llm_gemini.py`).

- [ ] **Step 2: Run** them. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - The prompt follows spec §7.2. Reuse `_block`. In the message, list each built-in as `id — name — description — facts: a, b — sections: x, y`.
  - `suggest_space` reuses `_template_from_reply`'s fence stripping and the `DRAFT_ATTEMPTS` loop. It uses rate-limit key `f"template-draft:{actor.user_id}"` with `TEMPLATE_DRAFTS_PER_USER_PER_DAY`. It cleans `name` with `clean_single_line(..., SPACE_NAME_MAX)`, and an invalid name becomes `""` rather than failing. After validating with `custom_template`, it replaces `name` with the base's name via `dataclasses.replace`. `CombineFailed` → `Unavailable(exc.message)`, as in `draft_template`.

- [ ] **Step 4: Run** `pytest` and `mypy`. Expected: PASS.

- [ ] **Step 5: Commit**: `feat(spaces): suggest a whole space from one sentence`.

---

### Task 5: Web API client and types

**Files:**
- Modify: `web/lib/api.types.ts`, `web/lib/api.ts`, `web/lib/constants.ts` (`TEMPLATE_PURPOSE_MAX = 280`)
- Test: `web/tests/unit/lib/api.test.ts`

**Interfaces:**
- Consumes: the REST shapes from Tasks 1, 3 and 4.
- Produces:
  - `Template.icon: string`.
  - `type SuggestedFact = { key: string; value: string }`.
  - `type SpaceSuggestion = { suggested: boolean; name: string; template: Template; base_template_id: string; facts: SuggestedFact[] }`.
  - `type CreateSpaceFact = { key: string; value: string; suggested: boolean }`.
  - `api.spaces.suggest(purpose: string): Promise<SpaceSuggestion>`, and `api.spaces.create(name: string, template?: SpaceTemplateChoice, facts?: CreateSpaceFact[])`, which omits `facts` from the body when it is empty or undefined.

- [ ] **Step 1: Write the failing tests**: `suggest` POSTs `{ purpose }` to `/api/spaces/suggest`. `create` with facts sends `facts`. `create` without facts sends no `facts` key.
- [ ] **Step 2: Run** `npm test -- api.test`. Expected: FAIL.
- [ ] **Step 3: Implement** following the existing `requestJson` pattern. Fix fixtures in `web/tests/unit/helpers/fixtures.ts` to include `icon`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(web): client for space suggestions and facts on create`.

---

### Task 6: The Spotlight New space dialog

**Files:**
- Create: `web/lib/space-setup.ts`, `web/lib/space-setup.types.ts`
- Create: `web/components/spaces/new-space/setup-prompt.tsx` (+ `.types.ts`), `template-chips.tsx` (+ `.types.ts`), `suggestion-panel.tsx` (+ `.types.ts`), `fact-row.tsx` (+ `.types.ts`)
- Rewrite: `web/components/spaces/new-space-dialog.tsx`
- Delete: `web/components/templates/template-picker.tsx`, `template-picker.types.ts`, and their tests
- Test: `web/tests/unit/lib/space-setup.test.ts`, `web/tests/unit/components/spaces/new-space-dialog.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `api.spaces.suggest` and `api.spaces.create` (Task 5), the existing `TemplateForm`, `toFormValue`, `toTemplateInput`, `canSaveTemplate`, `useTemplates` and `useMe`.
- Produces, in `web/lib/space-setup.ts`:
  - `type FactRow = { key: string; hint: string; value: string; on: boolean; suggested: boolean }`.
  - `rowsFromTemplate(template: Template, facts?: SuggestedFact[]): FactRow[]`. Template fact order. A matching fact (case-insensitive) gives `value`, `on: true` and `suggested: true`. Otherwise `value: ""`, `on: false`, `suggested: false`.
  - `editRowValue(row: FactRow, value: string): FactRow`. Sets `suggested: false`, sets `on: value.trim() !== ""` when the value was empty before, and sets `on: false` when the new value is empty.
  - `toggleRow(row: FactRow): FactRow`. A no-op when the value is empty.
  - `factsToSend(rows: FactRow[]): CreateSpaceFact[]`. Only rows that are on and have a non-empty trimmed value.
  - `syncRowsWithTemplate(rows: FactRow[], template: TemplateFormValue): FactRow[]`. Keeps the rows whose keys remain, adds new keys as empty rows, and drops removed keys. Used after Customize edits.
  - `CHIP_PLACEHOLDERS: Record<string, string>`: `trip` "Goa trip", `holiday-gifts` "Family Christmas", `household` "Flat 4B", `dinner-party` "Friendsgiving", `event` "Sam's 30th", `freelancer-client` "Website redesign", `team-project` "Q1 launch", `general` "Book club".

**Behaviour (spec §8). Exact copy:**
- Heading `What's this space for?`, or `Pick a starting point` when `me.draft_enabled` is false (the box and button are hidden then).
- Textarea placeholder `Goa trip with college friends, Dec 20–27, 6 of us, about ₹15k each`, `maxLength={TEMPLATE_PURPOSE_MAX}`, 2 rows growing to 4. Enter submits and Shift+Enter adds a newline. It has focus when the dialog opens.
- Button `Set it up` (wand icon), and `Setting up…` with a spinner while working. It is disabled when the box is empty.
- The pill in the panel reads `Suggested`, in ember style. It appears only for AI results.
- Empty fact value reads `Not set yet`.
- Notices: on failure or `suggested: false`, show `Orbit couldn't set that up. Pick a starting point below.`. On 429, show the server's message. For `suggested: false`, also show the Blank template in the panel.
- `Customize` toggles `TemplateForm` inside the panel.
- `Create space` is enabled only when the panel is showing, the name is non-empty and the custom template passes `canSaveTemplate`.
- On create: a suggestion or Customize sends `{ template: toTemplateInput(...) }`. An untouched chip sends `{ template_id }`. Facts come from `factsToSend`. On success: toast `Space created`, close and navigate (unchanged).
- Each new run (Set it up or chip) bumps a run counter. Results from older runs are ignored (the existing `draftRun` pattern).
- Panel reveal: height plus opacity, about 200 ms ease-out, with no animation under `prefers-reduced-motion`. Loading shows three shimmer lines.
- Chips are `<button type="button">` showing `icon name`, in one wrapping row, or one horizontally scrolling row below `sm`. The selected chip has `aria-pressed="true"`.
- On the chip path the name is empty, its placeholder is `CHIP_PLACEHOLDERS[id]`, and the name field takes focus.

- [ ] **Step 1: Write the failing `space-setup.test.ts` tests** for each function above. Include: an edited suggested value gives `suggested: false`; typing into an empty row turns it on; clearing a value turns it off; `factsToSend` skips rows that are off and rows that are empty.
- [ ] **Step 2: Run** `npm test -- space-setup`. Expected: FAIL.
- [ ] **Step 3: Implement `web/lib/space-setup.ts`.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Write the failing dialog tests** (mock `api`; reuse the patterns in the current `new-space-dialog.test.tsx`):
  - `suggests from a sentence and creates with switched-on facts`: type, press Enter, see `Goa trip` in the name field and `Dec 20–27`, then create. `api.spaces.create` is called with `("Goa trip", { template: … }, [{ key: "Dates", value: "Dec 20–27", suggested: true }, …])`.
  - `sends suggested false for an edited value`.
  - `does not send facts that are switched off`.
  - `chip path makes no AI call and leaves the name empty`: click `🏠 Household`. `suggest` is not called, the name placeholder is `Flat 4B`, and Create is disabled until a name is typed. Then `create` gets `{ template_id: "household" }` and no facts.
  - `ignores a suggestion that finishes after a chip was chosen`.
  - `shows the notice and keeps chips usable when suggesting fails`.
  - `hides the box when drafting is not set up`: shows `Pick a starting point`.
  - `customize adds a fact row`: add a fact key in `TemplateForm` and see a new `Not set yet` row.
- [ ] **Step 6: Run** them. Expected: FAIL.
- [ ] **Step 7: Implement the components and rewrite the dialog.** Delete `TemplatePicker` and its test. Remove its mention from `template-form.test.tsx` if present.
- [ ] **Step 8: Run** `npm test`, `npm run lint` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 9: Look at it.** Use the `run` skill to start the app, open New space at desktop width and at 390 px, and check it against the approved mockup (`.superpowers/brainstorm/1210-1795312245/content/new-space-directions.html`, direction A) in light and dark themes. Fix anything that doesn't match.
- [ ] **Step 10: Commit**: `feat(web): one-sentence Spotlight dialog for new spaces`.

---

### Task 7: Description line in the space header

**Files:**
- Modify: `web/components/space/space-header.tsx`
- Test: `web/tests/unit/components/space/space-chrome.test.tsx`

- [ ] **Step 1: Write the failing tests**: with `template.description = "Six friends planning a December week"`, the header shows that text. With an empty description, no description element is rendered.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**: one `<p>` under the space name, `text-sm text-muted-foreground truncate`, with `title={description}` so the full text shows on hover.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(web): show the space description under its name`.

---

### Task 8: End-to-end test and docs

**Files:**
- Modify: `web/tests/e2e/spaces-home.spec.ts`, and the e2e server stub (`api/tests/e2e_server.py`) so it gives a fake drafter a canned `suggest` reply
- Modify: `PRODUCT.md` (the template list under Capabilities; "Something else" becomes the one-sentence setup), `CHANGELOG.md`

- [ ] **Step 1: Write the e2e tests:**
  - `create a space from a sentence`: type the Goa sentence, press Set it up, then Create space. The space page shows the facts Dates, Headcount and Budget, and the description line.
  - `create a space from a chip`: pick Household, type the name `Flat 4B`, and create. The space page shows the template badge `Household`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: FAIL until the stub is wired, then PASS.
- [ ] **Step 3: Update `PRODUCT.md` and `CHANGELOG.md`.**
- [ ] **Step 4: Run all checks** (Global Constraints). Expected: all PASS.
- [ ] **Step 5: Commit**: `test(e2e): one-sentence space setup; docs: new templates`.
