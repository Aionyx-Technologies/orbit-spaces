# Landing page: anyone can join, and more than one example

Date: 2026-11-21
Status: awaiting approval
Related: `docs/2026-11-21-orbit-ai-space-setup-design.md` (the new template chips)

Lines marked **(call)** were decided while writing this, not by the product owner.

## Intent

Two gaps on the landing page:

1. The hero never says that someone without an AI assistant can join a space. That
   is only mentioned further down, inside the story and the join steps.
2. The only worked example is three friends planning a Vegas trip, so Orbit reads
   as a trip planner. Visitors should see it fits gifts, a shared flat, a dinner,
   an event, client work and team work too. Inspiration: the role-based scenarios on
   chatgpt.com/features/dots, split into life and work.

## Goals

- The hero copy says plainly that people with no assistant can join.
- A new section lets a visitor click through several kinds of space and see what
  each one looks like with people sharing into it.
- Each example shows mixed assistants **and** at least one person on the web, so
  the "no assistant needed" point is shown, not just stated.
- The landing page uses the same template names as the new New space dialog.

## Non-goals

- Changing the Vegas three-step story. It stays as the "how it works" walkthrough.
- Loading the examples from `GET /api/templates`. The landing page is static.
- New artwork or illustrations.

## Anti-goals

- An example that suggests Orbit reads chats, or that shows Orbit writing as if it
  were a person.
- Jargon (MCP, connector, OAuth). The existing test still applies.
- A section that only works with a mouse, or that moves for someone who prefers
  reduced motion.

## Approaches considered

- **A. Scenario cards** (like dots' "Built for busy days"). Everything is visible at
  once, but seven cards take a lot of the page.
- **B. Chips that switch one space preview (chosen).** It's compact and uses the
  same chips as the New space dialog. Only one example shows at a time, and it
  needs a small client component.
- **C. Tabs on the three-step story.** About 21 visuals, and it dilutes the
  walkthrough.

## Design

### Hero

`web/components/landing/landing.tsx`: the subhead becomes

> Invite anyone into a space, whichever assistant they use, or none at all.
> Everyone shares only what they choose, and each assistant reads only what is in
> the space.

### New section: "What will you plan together?"

Placed right after the Vegas story and before "Bring everyone in" **(call)**.

```
What will you plan together?
Every space works the same way. Pick one to see it.

Life  ✈️ Trip  🎁 Holiday gifts  🏠 Household  🍽️ Dinner party  🎉 Event
Work  💼 Client project  👥 Team project

┌─────────────────────────────────────────────┐
│ Family Christmas               (S)(M)(D)(L) │
│ ┃ Scarf for Mum                             │
│ ┃ Sam via ChatGPT · 1 hour ago              │
│ ┃ Budget: £40 each                          │
│ ┃ Dad on the web · yesterday                │
│ ┃ Leo: wants the Lego set                   │
│ ┃ Lena via Claude · 10 minutes ago          │
│ ⚠ To settle: Sam and Lena both picked Lego  │
└─────────────────────────────────────────────┘
```

- Seven chips in dialog order, without Blank, in two labelled rows: Life and Work
  **(call)**. Trip is selected at first.
- The chips follow the ARIA tabs pattern: a `tablist`, arrow keys move between
  chips, and the preview is the `tabpanel` **(call)**.
- The preview reuses the existing look of `SpaceVisual`: a card with the space name
  and member initials, and three feed items with the source rail, the assistant
  mark and "Person via Assistant · when". A web member reads "on the web", uses
  the web tone and a globe mark. It ends with one Orbit line, either "To settle"
  (ember) or a short "Written by Orbit" plan bullet, so it's clear Orbit's own
  writing is labelled.
- When the chip changes, the preview fades in with the existing `story-in`
  stagger, and doesn't move at all under reduced motion.
- New client component `web/components/landing/example-spaces.tsx` (+ `.types.ts`,
  following the repo convention). The content is a typed constant in that file.
  `HowItWorks` stays a server component and renders it.

Draft content (the builder may polish the wording; every example has one web member):

| Chip | Space | Three shares (person · source) | Orbit line |
|---|---|---|---|
| ✈️ Trip | Lisbon long weekend | Flights land Fri 9:10 (Ana · ChatGPT); Budget €600 each (Tom · web); Two Alfama apartments (Kai · Claude) | To settle: Tom wants a hotel, Kai shared apartments |
| 🎁 Holiday gifts | Family Christmas | Scarf for Mum (Sam · ChatGPT); Budget £40 each (Dad · web); Leo wants the Lego set (Lena · Claude) | To settle: Sam and Lena both planned the Lego |
| 🏠 Household | Flat 4B | Milk, eggs, oat milk (Jo · Grok); Rent due on the 1st (Mia · web); Bins on Tuesdays (Ravi · ChatGPT) | Written by Orbit: one grocery list, grouped by aisle |
| 🍽️ Dinner party | Friday supper | I'll bring dessert (Nina · Claude); Dev is vegan (Dev · web); Mains: lasagne (Omar · ChatGPT) | To settle: lasagne needs a vegan option for Dev |
| 🎉 Event | Leo's 30th | Venue holds 40 (Priya · Claude); 32 said yes (Leo's mum · web); DJ quote £300 (Alex · Grok) | Written by Orbit: within budget with the DJ |
| 💼 Client project | Café rebrand | Logo round 2 (Maya · Claude); Feedback: warmer colours (client · web); Invoice 1 sent (Maya · ChatGPT) | To settle: launch date, Mar 1 or Mar 15 |
| 👥 Team project | Spring launch | Landing copy ready (Sara · ChatGPT); QA sign-off Thu (Ben · Claude); Press list (Ola · web) | Written by Orbit: three tasks left before launch |

### Smaller updates

- "Bring everyone in", step 1: the template pills change from the old four to the
  new chip names with their icons **(call)**.
- The final CTA line "Plan the trip, the project or the client work together…"
  becomes "Plan the trip, the gifts, the house or the client work together, each
  of you in the assistant you already use, or on the web." **(call)**

## Testing

- `landing.test.tsx`: update the hero copy assertion and add "or none at all".
- A new test for the section: seven tabs in order with Trip selected; clicking or
  using the arrow keys switches the panel's space name; every example shows an
  "on the web" member; the Orbit line is labelled.
- The existing jargon test still covers the new copy.

## Left to the builder

- Final wording of the examples, within the rules above.
- Exact spacing and the visual treatment of the Life and Work labels.
- Whether the preview shares a sub-component with `SpaceVisual` or copies its markup.
