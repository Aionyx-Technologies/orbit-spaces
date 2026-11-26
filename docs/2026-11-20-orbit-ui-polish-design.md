# Orbit interface polish: header and headings

Date: 2026-11-20
Status: draft, awaiting approval
Builds on: `2026-11-19-orbit-mvp-design.md`, section 11

Lines marked **(call)** are decisions made while writing this document.

---

## 1. Intent

A review of the running app on the Spaces screen found three small things
that make the interface feel less finished than the rest of it:

1. The "Orbit" wordmark in the header does not look right.
2. The large page headings ("Spaces", "Pending spaces", "All spaces") use a
   narrow serif face that clashes with the clean sans-serif used everywhere
   else, and "Spaces" sits too close to the summary line under it.
3. Settings is a separate item in the top navigation, while the avatar in
   the corner does nothing useful. People expect the avatar to lead to
   their settings.

Small details like these decide whether the product feels trustworthy. This
change fixes the three and nothing else.

## 2. Goals

1. The wordmark and all headings use one consistent type style that matches
   the body text.
2. No heading touches or overlaps the line under it at any screen width.
3. Clicking the avatar opens the settings page.
4. Settings is reachable in one obvious place, not two.

## 3. Non-goals

- Renaming the product. Only the look of the wordmark changes.
- Redesigning the Spaces screen, the cards, filters or search.
- New settings or a new settings layout.
- A new logo symbol. The existing ring mark stays.

## 4. What changes

### 4.1 Wordmark

Today: "Orbit" is set in the narrow serif display face, larger than the
navigation text beside it.

Change:

- Set the wordmark in the same sans-serif family as the body text **(call)**,
  semibold, with slightly tight letter spacing.
- Size it so its cap height lines up with the ring mark beside it and it
  reads as one unit with the mark.
- Keep the ring mark and its colour.
- The mark and wordmark together are one link to `/spaces`, with the
  accessible name "Orbit, go to your spaces".

### 4.2 Headings

Today: page and section headings use the serif display face. The page
heading is tall and tight, and its descenders crowd the summary line
("6 spaces · 2 shared with you · 1 invitation waiting").

Change:

- Remove the serif display face from the app. All headings use the body
  sans-serif family **(call)**.
- Define the heading styles once as tokens and use them everywhere:

| Token | Used for | Style |
|---|---|---|
| `heading-page` | "Spaces", a space's name, "Settings" | 36px, semibold, line height 1.15, tight letter spacing |
| `heading-section` | "Pending spaces", "All spaces", panel titles | 22px, semibold, line height 1.25 |
| `heading-card` | Space names in cards | 18px, semibold |

- Space between a page heading and the summary line under it: at least 8px,
  set as a gap on their container and not as a margin on either.
- On phones (under 480px wide) `heading-page` drops to 28px.
- Apply the tokens on every screen, including sign-in, invite, settings,
  the policy pages and empty states, so no serif heading remains.
- Remove the serif font file and its import if nothing else uses it.

### 4.3 Avatar opens settings

Today: "Settings" is a navigation item next to "Spaces". The avatar at the
right of the header shows the person's initial and has no action.

Change:

- The avatar becomes a link to `/settings`.
- Remove "Settings" from the top navigation.
- The avatar has the accessible name "Settings", a tooltip reading
  "Settings" on hover and keyboard focus, and a visible focus ring.
- On `/settings`, the avatar shows the selected state (an accent ring), the
  way "Spaces" shows as selected on the Spaces screen.
- The click goes straight to the settings page with no menu in between
  **(call)**, as asked. Sign out stays on the settings page.
- The keyboard shortcut and the "Search or jump to" palette keep their
  "Settings" entry, so it is still reachable by typing.

With Settings gone, "Spaces" is the only item left in the navigation. Keep
it **(call)**. It tells people where they are and gives a way back from a
space or from settings.

## 5. What must not change

- Routes, data and behaviour of the settings page.
- The header's height and the position of search and the theme switch.
- Colours and the light and dark themes.
- Card layout, filters and sorting on the Spaces screen.

## 6. Acceptance checks

1. No text in the app renders in a serif face.
2. On the Spaces screen at 1440px, 768px and 375px wide, in light and dark,
   the page heading and the summary line do not touch or overlap.
3. The wordmark and the ring mark are vertically centred on each other.
4. Clicking the avatar on any screen opens `/settings`.
5. Tab reaches the avatar, shows a focus ring, and Enter opens `/settings`.
6. A screen reader announces the avatar as a link named "Settings".
7. The top navigation has no "Settings" item.
8. On `/settings` the avatar shows its selected state.

## 7. Testing

- Update the browser test: reach settings by clicking the avatar, not the
  old navigation item.
- Add a check that the header contains no link with the text "Settings"
  other than the avatar's accessible name.
- Re-run the existing screenshot set for every screen in light and dark, on
  phone and desktop, and review the headings by eye.
- Re-run the automated accessibility and overflow checks.

## 8. Build order

1. Add the three heading tokens and switch every heading to them. Remove
   the serif face.
2. Restyle the wordmark and make it a link.
3. Make the avatar a link to settings and remove the navigation item.
4. Update tests and screenshots.

Each step can be reviewed by itself.

## 9. Calls made in this document

1. Headings and wordmark use the body sans-serif family, not a second
   display face.
2. The sizes in the heading table.
3. The avatar goes straight to settings with no menu.
4. "Spaces" stays in the navigation as the only item.

## 10. Left to the builder

- Exact letter spacing and the wordmark's pixel size, judged by eye against
  the ring mark.
- The tooltip component, using what the app already has.

## 11. Decisions made while building

1. The home page headline is also a heading, and the three tokens in section 4.2 stop at 36px, which would have made it smaller. It keeps its large size, now set in the body typeface at semibold with tight spacing, as `text-display`. Geist has no italic, so its highlighted phrase is upright and in the primary colour instead of a slanted fake.
2. Which token each heading uses:
   - `heading-page`: the page headings on Spaces, Settings, a space, an invitation and the policy pages.
   - `heading-section`: section headings such as "Pending spaces", dialog and confirmation titles, the titles of panels and cards on the settings and space pages, empty states, and the "Check your email" and waitlist messages.
   - `heading-card`: space names and invitation names on cards.
3. Left as they were: the compact list row, whose space name is 16px, the small "Try the demo" label, and headings inside shared content such as plan text and notes.
4. The wordmark is 1.5 times the surrounding text size, so 24px in the header. The tall letters reach the top of the ring, and the centre of its capital letters sits within half a pixel of the ring's centre, measured on the rendered header. It still hides below 640px and leaves only the ring.
5. Only `heading-page` has tight letter spacing. `heading-card` keeps the 1.375 line height of the old card title so cards do not change height.
6. The tooltip is built from `radix-ui`, which the app already depends on, as a new `components/ui/tooltip.tsx`.
7. The avatar keeps telling assistive technology who is signed in. Its name is "Settings", and "Signed in as Alex" is its description, so a person using a screen reader loses nothing from before.
8. The pages the api draws (sign-in, consent and errors) are plain CSS, so they repeat the heading sizes and the wordmark style instead of sharing the tokens, and their serif font files and rules are removed too.
9. A test now fails if a serif font, a display font variable or one of the removed heading classes comes back, and if the three heading styles stop matching the table in section 4.2.
