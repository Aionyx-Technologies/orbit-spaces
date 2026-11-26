# Landing Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Say in the hero that people with no assistant can join, and add a "What will you plan together?" section with seven clickable example spaces.

**Architecture:** One new client component, `ExampleSpaces`, holds the seven examples as a typed constant and renders a tablist of chips plus one space preview. `HowItWorks` stays a server component and renders it between the Vegas story and "Bring everyone in". The rest is copy changes and one CSS rule for the preview's arrival.

**Tech Stack:** Next.js / React 19, TypeScript, Tailwind, Vitest + Testing Library (`renderPlain`), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-21-landing-examples-design.md`

## Global Constraints

- Hero subhead, exact: "Invite anyone into a space, whichever assistant they use, or none at all. Everyone shares only what they choose, and each assistant reads only what is in the space."
- Section heading, exact: "What will you plan together?" Subhead: "Every space works the same way. Pick one to see it."
- Chips in this order, no Blank: ✈️ Trip, 🎁 Holiday gifts, 🏠 Household, 🍽️ Dinner party, 🎉 Event (row "Life"); 💼 Client project, 👥 Team project (row "Work").
- Every example has exactly three shares, and exactly one of them is from `"web"`.
- No "MCP", "connector" or "OAuth" anywhere on the page (the existing jargon test).
- Files follow the repo convention: props and data types go in a sibling `.types.ts`.
- Under `prefers-reduced-motion: reduce` the preview doesn't animate.

## Review Focus

1. **Keyboard only:** Tab lands on the selected chip, the arrow keys move and select it (wrapping at both ends), and Home and End jump to the first and last chip. Tested in Task 2.
2. **Two tablists in one widget:** the Life and Work rows must act as one set of tabs, so arrow-right from Event goes to Client project. Tested in Task 2.
3. **Web share wording:** a web share must read "Name on the web · when", never "via Web". Tested in Task 2.
4. **Phone width:** the chip rows wrap and must not scroll sideways at 360 px. Checked by hand in Task 3.
5. **Orbit's line labelled:** each preview's last line must say "To settle" or "Written by Orbit", so it is never read as a person. Tested in Task 2.

---

### Task 1: Hero says anyone can join

**Files:**
- Modify: `web/components/landing/landing.tsx:40-43`
- Test: `web/tests/unit/components/landing/landing.test.tsx:11-20`

- [ ] **Step 1: Update the test.** In "explains Orbit in one sentence under a clear heading", change the regex to `/Invite anyone into a space, whichever assistant they use, or none at all\./`.
- [ ] **Step 2: Run it and make sure it fails.** Run `npm test -- tests/unit/components/landing/landing.test.tsx` from `web/`. Expected: that test FAILS.
- [ ] **Step 3:** Replace the subhead text in `landing.tsx` with the exact copy from Global Constraints.
- [ ] **Step 4: Run it again.** Expected: all tests in the file PASS.
- [ ] **Step 5: Commit** with the message `Say in the landing hero that people without an assistant can join`.

### Task 2: `ExampleSpaces` component

**Files:**
- Create: `web/components/landing/example-spaces.tsx` (`"use client"`)
- Create: `web/components/landing/example-spaces.types.ts`
- Test: `web/tests/unit/components/landing/example-spaces.test.tsx`

**Interfaces:**
- Produces: `export function ExampleSpaces(): JSX.Element` (no props), and `export const EXAMPLES: readonly Example[]` exported from `example-spaces.tsx` for tests.
- Types in `example-spaces.types.ts`:

```ts
export type ExampleShare = Readonly<{
  title: string;
  person: string;
  source: string; // assistant name, or "web"
  when: string;
}>;

export type Example = Readonly<{
  id: string;          // template id: trip, holiday-gifts, household, dinner-party, event, freelancer-client, team-project
  chip: string;        // "Trip"
  icon: string;        // "✈️"
  group: "Life" | "Work";
  space: string;       // "Lisbon long weekend"
  shares: readonly [ExampleShare, ExampleShare, ExampleShare];
  orbit: Readonly<{ kind: "settle" | "plan"; text: string }>;
}>;
```

Content: take it from the spec's draft content table, row by row (`space`, the three shares with person and source, and the Orbit line). Pick `when` values like "2 hours ago", "yesterday" or "10 minutes ago". The client in Café rebrand is named "Lee (client)".

Markup:
- `<section aria-labelledby="examples-title">` with an `h2#examples-title` and the subhead. Same section classes and heading scale as "Bring everyone in" in `how-it-works.tsx`.
- One wrapper `div role="tablist" aria-label="Example spaces"` that holds both rows. Each row has a visible group label (`<span>` Life / Work, muted, `aria-hidden`), then its chips. The chips are `button role="tab"` with `id="example-tab-{id}"`, `aria-controls="example-panel"`, `aria-selected`, and roving `tabIndex` (0 on the selected chip, -1 on the rest). The text is `{icon} {chip}`, with the icon in an `aria-hidden` span so the accessible name is the chip name alone. Styling: the same pill as the template list (`rounded-full border bg-card px-3 py-1.5 text-sm shadow-card`). The selected chip gets `border-primary bg-primary/10 text-foreground`.
- Keyboard: ArrowRight/ArrowDown select the next chip and ArrowLeft/ArrowUp the previous one, wrapping across both rows. Home and End select the first and last chip. Focus moves with the selection.
- `div role="tabpanel" id="example-panel" aria-labelledby="example-tab-{selected}"` with `key={selected.id}` so it remounts and replays the animation. It contains a card in the style of `SpaceVisual`: `heading-card` space name, member initials (one per share, tone from `sourceTone(share.source)`), and three `li.source-rail` items. Each item shows the `title`, then a meta line with `AssistantMark` (or `GlobeIcon` when `source === "web"`) and "`{person}` via `{source}` · `{when}`", or "`{person}` on the web · `{when}`" for web. Then the Orbit line: `settle` uses the ember box from `PlanVisual` (TriangleAlertIcon + "To settle" + text), and `plan` uses `Badge` with SparklesIcon "Written by Orbit" + text. Every animated child gets the class `example-in` with `--i` set to its index (CSS is in Task 3).

- [ ] **Step 1: Write the failing tests** in `example-spaces.test.tsx` using `renderPlain(<ExampleSpaces />)`:

```tsx
it("offers seven example spaces in dialog order, with Trip shown first", () => {
  expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/^\S+\s/, "")))
    .toEqual(["Trip", "Holiday gifts", "Household", "Dinner party", "Event", "Client project", "Team project"]);
  expect(screen.getByRole("tab", { name: "Trip" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Lisbon long weekend");
});

it("switches the preview when a chip is clicked", async () => {
  await user.click(screen.getByRole("tab", { name: "Holiday gifts" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Family Christmas");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Holiday gifts");
});

it("moves between chips with the arrow keys across both rows", async () => {
  await user.click(screen.getByRole("tab", { name: "Event" }));
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Client project" })).toHaveFocus();
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Café rebrand");
  await user.keyboard("{End}{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Trip" })).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Team project" })).toHaveFocus();
});

it("keeps only the selected chip in the tab order", () => {
  const tabs = screen.getAllByRole("tab");
  expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
});

it.each(EXAMPLES.map((e) => [e.chip, e] as const))(
  "%s shows three shares, one from someone on the web, and labels Orbit's line",
  async (chip, example) => {
    await user.click(screen.getByRole("tab", { name: chip }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(panel).getAllByText(/on the web ·/)).toHaveLength(1);
    expect(panel).not.toHaveTextContent(/via web/i);
    expect(panel).toHaveTextContent(example.orbit.kind === "settle" ? "To settle" : "Written by Orbit");
  },
);
```

(Each test renders first and gets `user` from `renderPlain`. If the member-initials row uses list markup, give it `role="img"` like `SpaceVisual` so the `listitem` count stays 3.)

- [ ] **Step 2: Run the tests and make sure they fail.** Run `npm test -- tests/unit/components/landing/example-spaces.test.tsx`. Expected: FAIL because the module isn't found.
- [ ] **Step 3: Implement** `example-spaces.types.ts` and `example-spaces.tsx` as specified above.
- [ ] **Step 4: Run the tests again.** Expected: all PASS. Also run `npm run typecheck` and `npm run lint` and expect both to be clean.
- [ ] **Step 5: Commit** with the message `Add a clickable set of example spaces for the landing page`.

### Task 3: Put it on the page and update the copy around it

**Files:**
- Modify: `web/components/landing/how-it-works.tsx` (render `<ExampleSpaces />` between the story `</section>` at line 134 and the "Bring everyone in" section; `TEMPLATES` at line 87; CTA paragraph at lines 268-271)
- Modify: `web/app/globals.css` (add the animation next to the `.story-panel .story-in` block at about line 450)
- Test: `web/tests/unit/components/landing/landing.test.tsx`

**Interfaces:**
- Consumes: `ExampleSpaces` from Task 2.

Changes:
- `TEMPLATES` becomes `["✈️ Trip", "🎁 Holiday gifts", "🏠 Household", "🍽️ Dinner party", "🎉 Event", "💼 Client project", "👥 Team project"]`. Keep the existing pill markup.
- The CTA paragraph becomes exactly "Plan the trip, the gifts, the house or the client work together, each of you in the assistant you already use, or on the web."
- CSS: add a keyframe `example-in` (from `opacity: 0; transform: translateY(0.5rem); filter: blur(3px)` to none). Then add `.example-in { animation: example-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: calc(var(--i, 0) * 70ms); }` inside `@media (prefers-reduced-motion: no-preference)` only.

- [ ] **Step 1: Write the failing tests** in `landing.test.tsx`:

```tsx
it("shows example spaces beyond a trip", () => {
  renderPlain(<Landing />);
  const section = screen.getByRole("region", { name: "What will you plan together?" });
  expect(within(section).getAllByRole("tab")).toHaveLength(7);
});

it("lists the new templates when explaining how to open a space", () => {
  renderPlain(<Landing />);
  const templates = screen.getByRole("list", { name: "Templates" });
  expect(templates).toHaveTextContent("Holiday gifts");
  expect(templates).not.toHaveTextContent("Friends trip");
});

it("closes by inviting people with or without an assistant", () => {
  renderPlain(<Landing />);
  expect(screen.getByText(/in the assistant you already use, or on the web\./)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests and make sure they fail.** Run `npm test -- tests/unit/components/landing/landing.test.tsx`. Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement** the changes listed above.
- [ ] **Step 4: Run the full checks.** Run `npm test`, `npm run typecheck` and `npm run lint` and expect all to pass. Then start the app with `npm run dev`, open `/`, and check by hand:
  - The section sits after the Vegas story.
  - Clicking chips swaps the preview with the fade.
  - With reduced motion turned on in DevTools rendering, nothing animates.
  - At 360 px wide the chips wrap and nothing scrolls sideways.
  - It looks right in both light and dark themes.
- [ ] **Step 5: Commit** with the message `Show example spaces on the landing page and update the template names`.
