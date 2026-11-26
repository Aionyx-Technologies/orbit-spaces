# Orbit Assistants tab and user settings

Date: 2026-11-20
Status: draft, awaiting approval (revision 2: adds profile photo, about me
and further user settings)
Builds on: `2026-11-19-orbit-mvp-design.md` section 11 and
`2026-11-20-orbit-ui-polish-design.md`

Lines marked **(call)** are decisions made while writing this document.

---

## 1. Intent

The avatar now opens the settings page. That page mixes two different
things: settings about the person, and the setup for connecting AI
assistants. Connecting an assistant is the first thing a new person must do
and the main reason to return, yet it sits behind the avatar where few will
look.

This change does two things:

- Moves everything about connecting assistants to a new **Assistants** tab
  beside **Spaces**.
- Turns the page behind the avatar into proper **user settings**: a profile
  with a photo and a short "about me", control over email, a few
  preferences, and account security.

## 2. Goals

1. Connecting an assistant is one click from any screen, in the top bar.
2. The page behind the avatar contains only settings about the person.
3. A person can add a profile photo and a short description that other
   members of their spaces see.
4. A person controls how often Orbit emails them, overall and per space.
5. Nothing that exists today is lost.
6. Every link that pointed people to settings in order to connect an
   assistant now points to the new tab.

## 3. Non-goals

- New connection features, such as per-space permissions or read-only
  connections.
- Changes to how connecting, consent or revoking work.
- Public profiles. A profile is visible only to people who share a space
  with its owner.
- Sending "about me" to assistants or to the combine step. It is for people
  to read. Using it to personalise plans is a possible later feature.
- Changing the sign-in email address, two-factor sign-in, language choice
  and a full account data download. These are listed in section 12 as
  later work.
- A dropdown menu on the avatar.

## 4. The Assistants tab

**Name: Assistants (call).** It matches the words already on the page
("Connect an assistant", "Connected assistants") and uses no technical
terms. Names considered and not chosen: "Connections" (vaguer), "Connect"
(reads as an action, not a place), "Integrations" and "Apps" (jargon).

**Route:** `/assistants`

**Top bar:** `Spaces` then `Assistants`. Each shows the selected state on
its own page.

**Page content, moved unchanged from settings, in this order:**

1. **Connect an assistant.** The explanation, the connector address with
   "Copy address", and the three guides with the note under them.
2. **Connected assistants.** The list with Revoke, and the empty message.

**Heading:** "Assistants", with one line under it: "Connect the AI
assistants you use, and see which ones have access."

**Layout:** the same single centred column and card style as settings. No
"back to Spaces" pill **(call)**, because the top bar has both tabs.

## 5. The settings page

Reached by the avatar. Route stays `/settings`. Heading stays "Settings".
Five cards, in this order.

### 5.1 Profile

| Field | Behaviour |
|---|---|
| **Photo** | Shows the current photo, or the initial on a coloured circle when there is none. "Upload photo" and "Remove". |
| **Display name** | As today. 1 to 60 characters. |
| **About me** | Optional. Up to 160 characters, plain text, one or two lines. A live character count. Placeholder: "A line about you, for the people you share spaces with." |
| **Signed in as** | The sign-in address, read only. |

A note under the card: "Your photo, name and about line are visible only to
people in your spaces."

**Photo rules**

- Accepts JPEG, PNG and WebP, up to 5 MB **(call)**. No SVG and no animated
  images.
- After choosing a file the person crops it to a square, then saves.
- The server decodes the image, crops, resizes to 256 by 256, strips all
  metadata including location, and re-encodes it as WebP. The original
  upload is discarded.
- Stored as a file on the data volume under `/data/avatars/` **(call)**, so
  it is covered by the existing backup. The filename is a random id, not
  the user id.
- Removing the photo deletes the file and returns to the initial.

**Where the profile shows**

- The header avatar.
- Member lists and the members panel in a space.
- Beside each item in the feed and each fact in shared memory.
- A small profile card on hover or tap of any avatar: photo, name, about
  line, and "left the space" where that applies.
- Invite pages and invite emails show the inviter's name and photo, so the
  invitee can recognise who invited them.

### 5.2 Email notifications

- **How often**, one choice for the whole account:
  - *As it happens*: the existing behaviour, batched to at most one email
    every 5 minutes per space.
  - *Daily summary*: one email a day, at 8:00 in the person's time zone,
    covering every space with changes.
  - *Off*: no activity emails.
- **Per space**: the existing switches, listed under the choice. They are
  hidden when the choice is *Off*.
- A note: "Sign-in links and invitations are always sent."

The same per-space switch also appears **on each space page**, in the
members panel, labelled "Email me about this space". Both controls change
the same setting.

### 5.3 Preferences

| Setting | Behaviour |
|---|---|
| **Time zone** | Filled in automatically from the browser at first sign-in. Editable. Used for the daily summary and for dates in emails. |
| **Default space** | Optional. "Used when you ask an assistant to share without naming a space." A list of the person's spaces, plus "Ask me each time". |

**Default space and the tools.** In the MVP, `space_id` may be omitted only
when the person has exactly one space. The rule becomes:

1. If `space_id` is given, use it.
2. Otherwise, if the person has a default space and still belongs to it,
   use it. The tool's reply names the space it used.
3. Otherwise, if they have exactly one space, use it.
4. Otherwise, return the list and ask which.

`leave_space` and `retract_item` are unchanged and never use the default.
If a person leaves or deletes their default space, the setting is cleared.

### 5.4 Security

- **Sign out** of this browser.
- **Sign out everywhere**: ends every web session for the account,
  including this one. Connected assistants are not affected, and the card
  says so with a link to the Assistants tab.
- A line showing when and where the account last signed in, by date and
  browser name only.

### 5.5 Delete account

Last, visually separated, with the existing confirmation. Deleting the
account also deletes the profile photo.

## 6. Data changes

New columns on `users`:

| Column | Meaning |
|---|---|
| `avatar_file` | Random filename under `/data/avatars/`, or empty |
| `avatar_updated_at` | Used to refresh cached images |
| `about` | Up to 160 characters, or empty |
| `time_zone` | IANA name, for example `Asia/Kolkata`. Default `UTC` |
| `email_frequency` | `instant`, `daily` or `off`. Default `instant` |
| `default_space_id` | A space id, or empty |

New column on `web_sessions`: `user_agent`, shortened to the browser name,
for the "last signed in" line.

Migration: existing users get the defaults. Nobody's emails change.

## 7. Interface changes

**REST**

| Method and path | Purpose |
|---|---|
| `PATCH /api/me` | now also accepts `about`, `time_zone`, `email_frequency`, `default_space_id` |
| `POST /api/me/avatar` | upload a cropped image |
| `DELETE /api/me/avatar` | remove the photo |
| `GET /api/users/{id}/avatar` | the image; only for the user themselves and people who share a space with them |
| `POST /api/me/sessions/revoke-all` | sign out everywhere |

Member objects returned by space routes add `about` and `avatar_url`.

**MCP tools.** No new tools. `list_spaces` and `get_space_context` do not
include "about me" or photos. The `space_id` rule changes as in 5.3.

**Daily summary.** An in-process timer checks every 5 minutes for accounts
whose local time has passed 8:00 and that have unsent changes, and sends
one email each **(call)**. No queue or scheduler service. It runs in the
single api process, like the existing batching.

## 8. Links and wording to update

Anything that sends a person to settings in order to connect an assistant
must now send them to `/assistants`: tips and empty states in a space, any
onboarding hint, the "Search or jump to" palette (add "Assistants", keep
"Settings"), the consent screen's manage link, emails, the `README` and the
guides in `docs/`.

A request to an old settings anchor for the assistant cards redirects to
`/assistants` **(call)**.

## 9. Security and privacy

- **Uploads.** The server never trusts the file's stated type. It decodes
  the image with an image library, rejects anything that fails to decode or
  exceeds 6000 pixels on a side, and stores only its own re-encoded output.
  Served with a fixed image content type and `nosniff`.
- **Metadata.** Location and device data are stripped from every photo.
- **Who can see a profile.** Only the person and people who currently share
  a space with them. After someone leaves a space, the remaining members
  see what the leave-space spec defines, and no longer see profile updates.
- **About me** is rendered as plain text, never as HTML or links.
- **Rate limits:** 10 photo uploads per account per day.
- **Sign out everywhere** removes every session row for the account in one
  step.
- **Logs** never contain the about text or image data.
- The data policy page gains one line each for the photo and the about
  text.

## 10. Acceptance checks

1. The top bar shows "Spaces" and "Assistants" on every signed-in screen.
2. `/assistants` shows the connect card and the connected list, and both
   work as they did on settings.
3. `/settings` shows the five cards in order and no assistant cards.
4. Uploading a photo updates the header avatar, the members panel and the
   feed without a reload of the app.
5. A photo taken on a phone has no location data in the stored file.
6. A file that is not a real image is refused with a clear message.
7. A person who shares no space with the owner cannot load their photo.
8. The about line shows on the profile card and never appears in any tool
   result.
9. With *Daily summary* chosen, changes during a day produce one email the
   next morning in the person's time zone, and none as they happen.
10. With *Off* chosen, sign-in and invite emails still arrive.
11. The per-space switch on a space page and in settings always agree.
12. With a default space set and several spaces, asking an assistant to
    share without naming a space uses the default and says which it used.
13. "Sign out everywhere" ends the current session and all others, and
    leaves connected assistants working.
14. Both pages pass the accessibility and overflow checks in light and
    dark, on phone and desktop.

## 11. Build order

1. The `/assistants` page and tab, moving the two cards. Update links and
   add the redirect.
2. Settings regrouped into the five cards with what exists today.
3. About me and time zone: columns, API, form, profile card.
4. Profile photo: upload, processing, storage, serving, display everywhere.
5. Email frequency and the daily summary. The per-space switch on the
   space page.
6. Default space and the tool rule.
7. Sign out everywhere and the last sign-in line.
8. Tests, screenshots, data policy and docs.

Steps 1 and 2 deliver the split by themselves. Each later step is
independent of the others.

## 12. Later, not in this change

- Changing the sign-in email address, with confirmation from both
  addresses.
- Two-factor sign-in.
- Downloading all account data in one file.
- Language and date format choices.
- Using "about me" to personalise combined plans, with the person's
  explicit consent.
- Status or availability on a profile.

## 13. Calls made in this document

1. The tab is named "Assistants".
2. No back pill on the Assistants page.
3. Old settings anchors redirect to the new page.
4. Photos up to 5 MB, stored as files on the data volume, 256 by 256 WebP.
5. About me is 160 characters and is not sent to assistants or to combine.
6. Three email frequencies, with the daily summary at 8:00 local time, run
   by an in-process timer.
7. A per-space email switch on each space page as well as in settings.
8. Default space, and the order of the `space_id` rule.
9. Sign out everywhere does not disconnect assistants.
10. The items in section 12 are left for later.

## 14. Left to the builder

- The crop control, using a small well-maintained library.
- The image library on the server.
- Colours for the initial circle when there is no photo.
- Wording of the daily summary email.

## 15. Decisions made while building

These changed or settled something this document left open.

1. **Photos are stored in the database, not as files.** Call 4 said "files on
   the data volume, covered by the existing backup". That is not true: the
   backup copies only the SQLite file. A photo is at most a few tens of
   kilobytes after re-encoding, so it lives in a `user_avatars` table keyed
   by person, which is backed up, exported with the database and erased when
   the account is (the foreign key cascades). `users.avatar_updated_at`
   gives the cache-busting `?v=` on the photo address, which is served with
   `Cache-Control: private, max-age=31536000, immutable` and `nosniff`.
2. **Image library:** Pillow (`pillow>=11,<13`). The decoder is given the
   file's bytes only after the size, format and dimensions have been checked,
   `Image.MAX_IMAGE_PIXELS` is set to the 6000 by 6000 limit, animated files
   are refused, the camera's rotation is applied before metadata is dropped,
   and the output carries no EXIF or colour profile.
3. **Request size.** The api's global body limit stays at 256 KB. The photo
   route alone accepts 5 MB plus 64 KB for the multipart envelope, through a
   per-path wrapper around the SDK's limiter, and both Caddy files give that
   one path 6 MB and everything else 1 MB.
4. **Who can load a photo.** The owner and anyone who shares a space that has
   not been deleted. Everyone else, and a person with no photo, get the same
   404. The invite page cannot use that rule because the visitor is often
   not signed in, so the inviter's photo has its own route that works only
   while the invitation is valid, and the invite email carries that same
   address. That means anyone holding a live invitation link can load the
   inviter's photo, and the data policy says so.
5. **Rate limit** of 10 photo changes a day is counted in memory, like the
   other limits, so a restart resets it.
6. **Daily summary** runs from the same in-process timer style as the
   batching, checked every 5 minutes. It covers only activity that happened
   before that day's 8:00 in the person's time zone, sends one email across
   all their spaces, and is skipped when the person switched to off. Pending
   summaries are in memory, so a restart loses the ones not yet sent, as it
   already does for batched activity emails. An unknown time zone falls back
   to UTC. Choosing "as it happens" again drops what was waiting for the
   summary rather than sending it late.
7. **Last sign-in** shows the most recent session other than the current one,
   and falls back to the current one when there is only one. Only the browser
   name is stored (Chrome, Edge, Firefox, Safari, Opera or "Another browser").
8. **Default space tool note.** When the default is used, the reply starts
   with a short note and the space's name, and the name sits inside a data
   block because people choose space names. `leave_space`, `retract_item` and
   `delete_space` never use the default. A default is cleared when its space
   is deleted, and ignored when the person is no longer in it.
9. **Migration numbering.** This change adds migration `0003`. The leave-space
   work is expected to add one as well, so whichever lands second must be
   renumbered to `0004` and chain from the first. The profile columns are
   added with plain `ADD COLUMN`, no check constraint and no foreign key on
   `default_space_id`, because rebuilding a table with foreign keys on would
   cascade deletes in SQLite.
10. **"Left the space" on the profile card** depends on the leave-space work.
    The card shows that line only when the member payload says the person left.
11. **The about line and photo never reach assistants.** Tools and the export
    use display names only, and a test fails if the about text or a photo
    address appears in a tool result.
12. **Time zone names.** Browsers still report some older names (for example
    `Asia/Calcutta` for `Asia/Kolkata`). The system time zone data in the api
    image does not always include those, so the api depends on the `tzdata`
    package, which Python falls back to, and the web app also maps the common
    older names to the current ones before it saves.
13. **Live profile edits.** A new name or about line is announced as
    `profile_changed` to every space the person is in, the same as a photo
    change, so other members see it without a reload. Saving the same values,
    or changing only time zone, email frequency or default space, announces
    nothing.
14. **Time zone is saved with the form.** The browser's time zone fills the
    field while the saved value is still the default `UTC`, but it is saved
    only when the person presses Save, so a person who deliberately keeps
    `UTC` is never overwritten. Until they save, daily summaries use `UTC`.
