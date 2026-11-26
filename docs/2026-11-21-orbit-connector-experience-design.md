# Orbit connector experience improvements

Date: 2026-11-21
Status: phase A built on 2026-11-21 (decisions in section 19); phases B
and C not started. Revision 3 added in-app notifications for mentions;
revision 2 added mentions, the important flag, file attachments and
download as a file.
Priority: HIGH. Phase A should land before the private test widens.
Builds on: `2026-11-19-orbit-mvp-design.md`,
`2026-11-20-orbit-assistants-tab-design.md`

Lines marked **(call)** are decisions made while writing this document.

---

## 1. Intent

Sharing and combining already work across several assistants. The risk now
is habit: an assistant does not make a space feel present, and connecting
an assistant still takes too many manual steps. People who do not connect,
or who never hear that something changed, will not come back.

This document turns the points raised in the Releasing Orbit space into
buildable work, in three phases. Revision 2 adds four more that came from
using the space for real: the first spec had to be pasted in as plain text,
with "IMPORTANT" and an @name typed by hand, because Orbit has no files,
no flag and no mentions.

## 2. The points

| # | Point | Phase |
|---|---|---|
| 1 | Tell people what is new since they last looked | A |
| 2 | Mark assistants that are already connected | A |
| 3 | One-click connect buttons, with copy-and-open as the fallback | A |
| 4 | A general fallback and more agents | A |
| 5 | Say who shared what in replies | A |
| 6 | A clear "what can I do here?" | A |
| 7 | Handle "To settle" points properly | B |
| 8 | Scoped reading | B |
| 9 | Reactions, pinning and clearer take-back | C |
| 10 | Download any item as a file | A |
| 11 | Mention a member, shown highlighted | B |
| 12 | Mark an item as important | B |
| 13 | Attach files to an item, and download them | B |

Phase A is small and aimed at first impressions and return visits. Phase B
is real feature work. Phase C waits for tester demand.

## 3. Goals

1. A person who mentions a space to their assistant learns at once what
   changed since they last looked.
2. Connecting an assistant takes one click and at most one paste.
3. The Assistants page never shows the same assistant as both available
   and connected without saying so.
4. Open disagreements in a plan can be resolved and stay resolved.
5. A person can call a specific member's attention to an item, and mark an
   item as important, without typing labels by hand.
6. A document shared into a space can be downloaded as a file, not only
   read as pasted text.

## 4. Non-goals

- Pushing messages into an assistant. Assistants only see Orbit when they
  call it, so every "notice" here appears in a tool result.
- Building integrations specific to one assistant beyond a link.
- Changing the consent or sign-in flow.
- Mentioning everyone at once, or people outside the space.
- Editing a file inside Orbit, version history for files, or previews of
  office documents.
- Virus scanning. Risk is limited by allowing only a short list of file
  types and never serving a file as a web page.

---

## Phase A

### 5. Point 1: what is new since you last looked

**Data.** New column `space_members.last_read_at`.

**Rule.** An item, fact or plan is "new" for a person when it was created
after their `last_read_at` and was not written by them.

**When it updates (call).** After a person's `get_space_context` or
`read_space` call returns, or after they open the space on the web page.
It is per person, not per assistant: reading in one assistant marks the
space read everywhere.

**Tool changes.**

- `list_spaces`: each space shows a count, for example "3 new".
- `get_space_context`: opens with a short section, "New since you last
  looked", listing new facts, items and plans by title, sharer and
  assistant, before the full context. When nothing is new it says so in one
  line.
- The first call ever for a space treats nothing as new and says "This is
  your first look at this space."

**Web.** The spaces list shows the same count as a badge.

### 6. Point 2: mark connected assistants

On the Assistants page, the top list keeps every supported assistant
**(call: badge, not hide)**. An assistant with at least one active
connection shows a "Connected" badge and a check mark, and its button
reads "Connect another". The list order does not change when something
connects.

Matching uses the connected client's name. If a client name is not
recognised, it appears only in "Connected assistants".

### 7. Point 3: one-click connect buttons

Each supported assistant gets a button: "Add to Claude", "Add to ChatGPT",
"Add to Grok".

**Default behaviour for every button, copy-and-open:**

1. Copy the connector address to the clipboard.
2. Open that assistant's connectors page in a new tab.
3. Show an instruction that stays on screen until dismissed, for example:
   "Address copied. Click New Connector, choose Custom, and paste. If it
   asks you to sign in, do that first, then open Connectors."

Steps 1 and 2 must run inside the same click handler, or browsers block
them.

**Pre-filled link, only where verified.** A link that opens the assistant's
add-connector dialog with the name and address already filled in is used
only for an assistant where a person has opened the link in a browser and
confirmed it works. Until then that assistant uses copy-and-open. The
suggested pre-fill link for Claude and the claim that the other two cannot
pre-fill are **unverified** and must be tested before building.

**If copying fails.** Show the address selected in a field with "Press
Ctrl+C to copy". Never fail silently.

**Links live in one file**, `web/lib/assistant-links.ts`, with one entry
per assistant: name, connectors page, optional pre-fill pattern, and the
instruction text. A broken link is then a one-line fix. Re-check every link
before each release.

The plain address with its Copy button stays on the page.

### 8. Point 4: a general fallback and more agents

- Add a card, "Using a different assistant?", with the address, a Copy
  button, and one sentence: "Add this address as a custom connector (MCP)
  in your assistant's settings."
- Add a named button for another agent (Muse, OpenClaw, Hermes Agent, Wabi
  were suggested) only after someone has connected Orbit from that agent
  and recorded the steps **(call)**. Each addition is one entry in the
  links file.

### 9. Point 5: say who shared what

Tool results already carry who shared each item, through which assistant
and when. Two changes:

- Each note adds a relative time beside the timestamp, for example
  "2 hours ago", since an assistant may not know the current time.
- The connector's instructions add one sentence: "When you use something
  from a space, say who shared it, through which assistant, and roughly
  when."

Orbit cannot force an assistant to do this. The check is that it happens in
practice with the three main assistants.

### 10. Point 6: what can I do here?

`list_spaces` and `get_space_context` end with one short line, under 300
characters, such as: "You can ask me to share something here, save a fact,
show what's new, combine everything into one plan, or invite someone."

It lists only actions the person can take in that space. Offering the same
list as MCP prompts is left to the builder.

### 10a. Point 10: download any item as a file

Every item on the web page gets a "Download" action that saves its title
and content as a Markdown file, named from the title, for example
`connector-experience-improvements.md` **(call)**. Nothing is stored. The
file is built from the item's text when asked for. A combined plan
downloads the same way.

This is small, needs no storage, and covers the common case of a spec or
plan that was shared as text.

---

## Phase B

### 11. Point 7: "To settle" points

Today a combined plan lists disagreements as text, and nothing tracks them.

**Data.** New table `settle_points`: id, space_id, plan_item_id, text,
status (`open` or `settled`), resolution, settled_by, via, settled_at.

**Behaviour.**

- Combine returns its "To settle" list as separate points, saved as rows.
- A member settles a point by giving a resolution. It is recorded with
  their name and assistant.
- Settling offers to save the resolution as a shared fact. The person
  confirms. It is not automatic.
- The next combine is told which points are settled and must respect them.
  Open points carry over and are not duplicated.
- An assistant may suggest a resolution, drawing on what was shared. Only a
  person's explicit request settles a point.

**Tools.** `list_open_points(space_id)`, read-only.
`settle_point(point_id, resolution)`, a write.

**Web.** Under the latest plan, a checklist of points with "Settle" on each
and the resolution shown once settled.

### 12. Point 8: scoped reading

- `read_space` gains optional filters: `shared_by`, `since`, and
  `kind`.
- `get_space_context` gains an optional `include` list: `facts`, `items`,
  `plan`, `open_points`, `new`. Default is everything, as today.

This matters once spaces grow. It is in phase B for that reason.

### 12a. Point 11: mention a member

**How a mention is made.**

- On the web page, typing `@` in the share box opens a list of the space's
  current members. Picking one inserts the mention.
- From an assistant, `share_to_space` gains an optional `mentions` list of
  member names. Orbit matches each name to a current member, ignoring
  case, and accepts a first name when it is unique in the space. A name
  that matches nobody, or more than one member, makes the call fail with
  the list of members, so nothing is posted with a wrong mention.
- An `@name` typed in the text is also recognised when it matches exactly
  one member.

**Data.** New column `items.mentions`, a list of user ids.

**How it looks.** A mention is shown as a highlighted chip in the accent
colour, with the member's name. A mention of the person viewing the page is
highlighted more strongly, and that item gets a coloured edge so it stands
out in the feed. Colour is never the only signal: the chip also has a
distinct shape and the item carries a "Mentions you" label.

**Notifications.**

- The mentioned person gets an email straight away, "You were mentioned in
  <space>", outside the usual batching **(call)**. With email frequency set
  to *Off*, no mention email is sent.
- `list_spaces` shows "1 mention" beside the space, and
  `get_space_context` lists items that mention the person first, under
  "Mentions you".

Only current members can be mentioned. A mention gives no extra access.

**In-app notifications, when Orbit is open in a browser tab.**

The web app already holds a live connection to the api for each open
space. Add one live connection per signed-in person, for events that
concern them in any space **(call)**, so a mention is seen whichever page
they are on.

When the person is mentioned:

- **A toast** appears in the corner: who mentioned them, in which space,
  and the item's title. Clicking it opens the item. It stays for 8 seconds
  and pauses while the pointer is over it.
- **A bell in the header** shows a count of unread notifications. Opening
  it lists recent ones, newest first, each linking to its item. Opening an
  item marks its notification read. "Mark all as read" clears the count.
- **The browser tab title** gains a count, for example "(1) Orbit", so it
  is noticed when the tab is in the background.
- **A desktop notification** from the browser is offered once, in
  settings, as an opt-in. It is shown only when the Orbit tab is not the
  one in view. Orbit never asks for this permission on its own.

If the person is mentioned while an Orbit tab is open and in view, the
email is still sent **(call)**. A missed mention costs more than one extra
email. The email frequency setting *Off* still suppresses it.

The same toast and bell are used for an item marked important (point 12).
Ordinary activity updates the feed and the "new" counts as today and does
not raise a toast.

Data: new table `notifications`: id, user_id, kind (`mention` or
`important`), space_id, item_id, created_at, read_at. Kept for 30 days.

REST: `GET /api/notifications`, `POST /api/notifications/read`,
`GET /api/me/events` for the per-person live connection.

**In connected assistants.**

An assistant cannot be made to show an alert. It sees Orbit only when the
person's message leads it to call an Orbit tool, and none of the main
assistants surfaces messages a connector sends on its own. So:

- A mention appears the next time the assistant reads Orbit, listed first
  under "Mentions you", as described above. This already works with every
  assistant.
- The connector's instructions add: "When a result says the person was
  mentioned, tell them first, before anything else."
- The settings page explains a way to get closer to a live alert: assistants
  that support scheduled tasks can be asked to check Orbit on a schedule,
  for example "every morning, check my Orbit spaces and tell me about
  mentions". This is set up by the person in their assistant. Orbit only
  documents it.
- If an assistant later supports connector-initiated notifications, Orbit
  can send mentions through it. That is noted as future work and not built
  now.

### 12b. Point 12: mark an item as important

- A sharer can mark their own item as important: a switch in the web share
  box, and an optional `important` flag on `share_to_space`.
- An important item shows an "Important" label and a coloured edge, and
  stays at the top of the feed until every member has read it **(call)**.
  After that it returns to its place by date and keeps the label.
- Its activity email has "Important:" at the start of the subject and is
  sent straight away.
- `get_space_context` lists unread important items first, after mentions.
- To prevent overuse, a person can have at most 3 unread important items
  per space **(call)**. The sharer can remove the mark.

Data: new column `items.important`, boolean.

### 12c. Point 13: attach files to an item

**What a person can do.** Attach files when sharing, and download any file
attached to an item in a space they belong to.

**Limits (call).** Up to 5 files per item, 10 MB each, 200 MB per space.
Allowed types: Markdown, plain text, CSV, JSON, PDF, and PNG, JPEG and WebP
images. Not allowed: HTML, SVG, scripts, archives and executables.

**From the web page.** An attach button and drag and drop in the share
box. Each attachment appears on the item as a row with its name, type,
size and a Download button. Markdown and text files also show a "Preview"
that renders the text.

**From an assistant.** Assistants cannot upload arbitrary files through
tool calls, so:

- `share_to_space` gains an optional `attachments` list of
  `{filename, content}` for text files only (Markdown, plain text, CSV,
  JSON), up to 200,000 characters each. This lets an assistant attach a
  document it wrote as a real downloadable file and keep the item's own
  text short.
- `get_space_context` and `read_space` list each item's attachments by
  name, type and size.
- New read-only tool `read_attachment(file_id)` returns the text of a
  text-type attachment, in pages if long. For a PDF or image it returns
  the name and size and says to open it on the web page.

**Data and storage.** New table `item_files`: id, item_id, filename,
content_type, size, storage_name, created_at. Files are stored on the data
volume under `/data/files/` with a random storage name, so the existing
backup covers them.

**Serving.** `GET /api/files/{id}` checks membership, sends the file as a
download with its original name, a content type taken from the allowed
list (never from the upload), and `nosniff`. No file is ever served as a
page that could run in the browser.

**Lifecycle.** Taking back an item deletes its files. Leaving a space with
"remove what I shared" deletes them. Deleting a space or an account deletes
them. Export lists attachments and includes the content of text files.

**Checks on upload.** The type is decided by the file's content, not its
name. Images are decoded and re-encoded with metadata removed, as for
profile photos. Filenames are cleaned of path characters.

---

## Phase C

### 13. Point 9: reactions, pinning, clearer take-back

- **Reactions and short notes** on an item.
- **Pinning** a fact or the latest plan so it always shows first.
- **Clearer take-back:** a visible "Take back" on a person's own items,
  with a short confirmation and an undo for a few seconds.

Not designed further here. Build only when testers ask.

---

## 14. Security and privacy

- "New since you last looked" shows only content the person can already
  read. `last_read_at` is private to each person.
- Connect buttons only open a page and copy a public address. They carry
  no token.
- All new text returned by tools stays inside the existing data-not-
  instructions blocks.
- `settle_point` requires membership and is a write, so assistants ask the
  person to confirm.
- Mention names and attachment filenames are text typed by people. They
  are rendered as text and returned to assistants inside the
  data-not-instructions blocks.
- Attachment content read by an assistant is data from a person. The same
  rule applies: it is never treated as instructions.
- Files are reachable only by current members, through the api. There are
  no public file links.

## 15. Acceptance checks for phase A

1. After another member shares, `list_spaces` shows a count and
   `get_space_context` opens with the new item. Calling again shows nothing
   new.
2. A person's own items never count as new for them.
3. A connected assistant shows a "Connected" badge in the top list.
4. Each "Add to" button copies the address and opens the right page in one
   click, and the instruction stays visible.
5. With clipboard access blocked, the address appears selected with the
   copy hint.
6. Every link in the links file opens the intended page, checked by hand.
7. The "different assistant" card is present with a working Copy button.
8. Replies from the three main assistants name who shared an item, in a
   manual test.
9. The "what can I do here" line appears and lists only allowed actions.
10. "Download" on any item saves a Markdown file with its title and text.

## 15a. Acceptance checks for the phase B additions

1. Typing `@` on the web page lists members, and the mention shows as a
   highlighted chip. The mentioned person sees it highlighted more strongly
   with a "Mentions you" label.
2. Sharing from an assistant with a mention notifies that member by email
   at once, and their `get_space_context` lists it under "Mentions you".
3. A mention of an unknown or ambiguous name is refused and nothing is
   posted.
4. An important item stays at the top until every member has read it, and
   a fourth unread important item from one person is refused.
5. A Markdown file attached on the web page downloads with its original
   name and identical content.
6. An assistant can attach a Markdown file when sharing, and another
   member can download it from the web page and read it with
   `read_attachment`.
7. An HTML or SVG upload is refused. A file renamed to `.md` that is
   really something else is refused.
8. A non-member cannot download a file, even with its id.
9. Taking back an item removes its files from storage.
10. With Orbit open on any page, a mention raises a toast, the bell count
    goes up, and the tab title shows the count. Opening the item clears it.
11. With no Orbit tab open, the mention email arrives, and the bell shows
    the notification at the next visit.
12. A desktop notification appears only after the person opted in and only
    when the Orbit tab is not in view.
13. A person never receives a notification for a space they are not in.

## 16. Build order

Phase A:
1. `last_read_at`, the new section and counts.
2. Badge on the Assistants page.
3. Links file and the three buttons with copy-and-open.
4. Verify pre-fill by hand, and switch on any that work.
5. The general fallback card.
6. Relative times, the instruction sentence, the closing line.

7. Download any item as a Markdown file.

Phase B, in this order: mentions, the important flag, file attachments,
settle points, scoped reading. Phase C: on demand.

## 17. Calls made in this document

1. Read state is per person, not per assistant.
2. Connected assistants get a badge and stay in the list.
3. Copy-and-open is the default, and pre-fill is used only after a manual
   check.
4. New agents get a button only after a confirmed connection.
5. Settling a point never saves a fact without confirmation.
6. The phase each point is in.
7. Download builds a Markdown file on request and stores nothing.
8. Mention emails are sent at once, outside batching.
9. An important item stays on top until every member has read it, with a
   limit of 3 unread per person per space.
10. Attachment limits and the allowed file types.
11. Assistants can attach text files only.
12. One live connection per person for notifications, in addition to the
    per-space one.
13. The mention email is sent even when an Orbit tab is open.
14. Desktop notifications are opt-in from settings.

## 18. Left to the builder

- Wording of the notices, instructions and the closing line.
- Whether to also expose actions as MCP prompts.
- How plan text is split into separate settle points.

## 19. Decisions made while building phase A

These changed or settled something this document left open.

1. **Read state is one nullable column**, `space_members.last_read_at`
   (migration `0005`). Empty means the person has never looked. Every
   existing member starts empty, so the first call after the upgrade says
   "This is your first look at this space." and counts nothing as new.
2. **The mark is set to the time the call started, not when it ended.**
   Something shared while a call is running is shown as new next time,
   instead of being lost.
3. **A plan counts as new for every member, including whoever asked for
   it.** A plan has no human author (`shared_by` is empty), so the rule
   "not written by them" cannot exclude the requester. Storing the requester
   on the plan was rejected because the leave-space design removes content
   by `shared_by`. A person who combines will see that plan listed once on
   their next look.
4. **What counts.** Retracted items never count. Only the current value of
   a fact counts, so a fact changed twice by someone else counts once, and a
   fact the person replaced themselves is theirs. The "New since you last
   looked" list shows at most 20 entries, then "...and N more", and the
   count in `list_spaces` and on the web badge includes the ones cut.
5. **The web marks a space read through `POST /api/spaces/{id}/read`**, sent
   by the space page when it opens, when an item, plan or fact arrives while
   the tab is in view, and when a hidden tab is shown again. `GET
   /api/spaces/{id}` does not mark anything, because a read-only request
   with a side effect would also fire on any prefetch. `GET /api/spaces`
   gains `new_count`, an additive field the web treats as 0 when it is
   missing.
6. **`list_spaces` shows "N new" or "nothing new" on every line.** A space
   the person has never opened shows "nothing new".
7. **The "what can I do here" line only offers what is true.** Combining is
   offered when the AI key is set and something has been shared, inviting
   when the space has room, taking back when the person has shared a note,
   and starting another space when under the limit of 50. Every variant is
   under 300 characters and a test checks it.
8. **Relative time** is written beside the timestamp, for example
   `2026-11-21T10:00:00Z (2 hours ago)`, in item, fact and plan notes.
9. **Connect buttons.** An assistant is matched to a connection by the
   client name through the existing `assistantKey`. The Assistants page
   stays a server component, so the connect card reads the connections
   itself and a revoke updates the badge. The instruction stays until
   dismissed and always carries an "Open <assistant> connectors" link,
   because a blocked pop-up cannot be detected from a page that opens with
   `noopener`. The copy-failure hint says "Press Cmd+C to copy" on a Mac and
   "Press Ctrl+C to copy" elsewhere.
10. **Links, none opened by a person yet.** `web/lib/assistant-links.ts`
    holds ChatGPT `https://chatgpt.com/#settings/Connectors`, Grok
    `https://grok.com/connectors` (from `docs/connect-grok.md`) and Claude
    `https://claude.ai/settings/connectors`. The pre-fill pattern is unset
    for all three, so every button is copy-and-open.
10c. **Connected assistants are removed from the top list, not badged.**
    This reverses call 2 and section 6, at the owner's request: with the
    badge, a connected assistant still showed a "Connect another" button
    that read oddly, and the same assistant is already listed under
    "Connected assistants". The top list now holds only assistants that are
    not connected, with a plain "Connect" button, and the order of the rest
    does not change. When every listed assistant is connected the card says
    so and keeps the address field. A revoke puts the assistant back in the
    list. The cost is that a second connection for the same assistant, such
    as another account, has no button of its own: the address field above
    and the "Using a different assistant?" card still work for it.
10b. **The button says "Connect", not "Add to <name>"**, at the owner's
    request, so all seven rows read the same. Its accessible name keeps the
    assistant, for example "Connect ChatGPT", so a screen reader can tell
    the buttons apart.
10a. **Muse, OpenClaw, Hermes Agent and Wabi get a button too, copy only.**
    They were added to the list by another change, and the first build left
    them without a button because this document says a named button waits
    for a confirmed connection (point 4). They now have a "Connect"
    button after all, at the owner's request. No connectors page is known
    for any of them, so none is invented: the button copies the address and
    shows the steps ("add a remote MCP server named Orbit and paste"), with
    no new tab and no "Open connectors" link. `connectorsUrl` is optional in
    the links file for this reason. The steps are the ones written for the
    guide list and have not been checked in those assistants.
11. **Download** is built in the browser from the item's text: `# <title>`,
    a blank line, then the content, ending in one newline. The file name is
    the title in lower case with letters and numbers from any script kept,
    cut to 60 characters, and `orbit-item.md` when nothing is left. It is on
    every item in the feed and on the latest plan.
12. **A layout bug found by the browser tests:** Download beside Combine
    pushed the plan card past the edge at 390 pixels. The card header now
    wraps.

Not verified: build-order step 4 and acceptance checks 6 and 8 need a person
with the real assistants, and nothing here was tried in a real ChatGPT,
Claude or Grok.

