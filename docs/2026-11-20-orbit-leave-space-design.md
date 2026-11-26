# Orbit leave space design

Date: 2026-11-20
Status: draft, awaiting approval
Builds on: `2026-11-19-orbit-mvp-design.md`

Lines marked **(call)** are decisions made while writing this document.

---

## 1. Intent

In the MVP a person can join a space but cannot leave one. The only ways
out are deleting the whole space, which only its creator can do, or
deleting the account. A person who joined a space they no longer want to be
part of has no clean exit, and their assistants keep access to it.

This feature lets any member leave a space on their own, at any time,
without needing anyone's permission, and decide what happens to what they
shared.

## 2. Goals

1. Any member can leave any space they belong to, from the web page or from
   an assistant.
2. Leaving takes effect at once, for the web app and for every connected
   assistant.
3. The person leaving chooses whether what they shared stays or is removed.
4. The space keeps working for the members who remain.
5. A space is never left without someone responsible for it.
6. Remaining members are told that someone left.

## 3. Non-goals

- Removing another member. Only leaving by one's own choice is covered.
- Transferring ownership by hand.
- Pausing or muting a space without leaving. Email notifications can
  already be turned off per space.
- Undoing a leave. Coming back needs a new invite.
- Archiving a space.

## 4. Anti-goals

- A person who left can still read or write the space through any route,
  including an assistant that was connected before they left.
- Leaving deletes or damages other members' content.
- A space ends up with no members but still holds data.
- A person leaves by accident because an assistant acted without a clear
  confirmation.
- Content the person asked to remove is still readable by others.

## 5. Approaches considered

**A. Leaving always keeps the person's content.** Simplest, and the space
stays complete. Rejected alone because it breaks the rule that a person
controls what they shared.

**B. Leaving always removes the person's content.** Strongest privacy.
Rejected alone because it can gut a shared plan the others still rely on,
when the person leaving may not mind it staying.

**C. The person chooses when leaving (chosen).** Keep is the default.
Remove is one extra tick. This matches the existing rule that a sharer can
retract their own items.

## 6. Behaviour

**Leaving**

1. The person picks "Leave space".
2. A confirmation explains what will happen and offers one choice:
   "Also remove what I shared". It is off by default.
3. On confirm, in a single transaction:
   - Their membership ends.
   - If they chose removal, their content is removed (see below).
   - Invites they created that are still unused are revoked **(call)**.
   - If they were the owner, ownership passes on (section 7).
   - If they were the last member, the space is deleted (section 7).
4. The person is taken to their list of spaces.

**Access after leaving**

- Every membership check fails for that person from then on. This covers
  the REST API, every MCP tool and the live event stream.
- Their open event stream for that space is closed.
- Their assistants stay connected to Orbit. Those connections simply no
  longer reach this space. The space no longer appears in `list_spaces`.
- No more emails about the space are sent to them.

**Content when the person keeps it**

- Their items and the facts they set stay as they are.
- Their name stays on that content, with a "left the space" label
  **(call)**. The others have already seen it, and removing the name would
  make the history harder to follow.
- They can no longer retract those items, because they are no longer a
  member. The confirmation says so.

**Content when the person removes it**

- Their items are retracted, the same as the existing retract action.
- Facts whose current value they set are cleared **(call)**. Older values
  set by other members are not restored automatically, to avoid bringing
  back out-of-date facts without anyone noticing.
- Combined plans stay. A plan that used any removed item shows a note:
  "Based in part on content that has since been removed." Members can run
  combine again.
- Their name is replaced with "A former member" in the member history.

**Coming back.** A person who left can rejoin only through a new invite.
They return as a new member. Content they kept is linked to them again.
Content they removed is not restored.

## 7. Ownership and the last member

The MVP lets only the space's creator delete it. This feature makes that an
explicit owner role so it can move.

- `owner` starts as the creator.
- When the owner leaves and others remain, ownership passes to the member
  who has been in the space longest **(call)**. That member is told by
  email.
- When the last member leaves, the space and everything in it are deleted.
  The confirmation states this clearly and requires the person to type the
  space's name **(call)**.

## 8. Notifications

- Remaining members get an activity email: "A member left the space", using
  the existing batching and per-space setting. If the person removed their
  content, the email says that some shared content was removed.
- The new owner, if ownership moved, gets a separate email straight away.
- A `member_left` live event updates open pages.
- The person who left gets no email. The screen already confirmed it.

## 9. Data changes

| Change | Detail |
|---|---|
| `space_members.left_at` | New, nullable. Leaving sets it. The row is kept so past content can still show who shared it. |
| `space_members.content_removed` | New, boolean. True when the person chose removal. Drives the "A former member" label. |
| `spaces.owner_id` | New. Migration copies `created_by` into it. Delete permission moves from `created_by` to `owner_id`. |
| `items.sources_removed` | New, boolean, plans only. Set when a source item is retracted by a leave. |

- The membership rule everywhere becomes: a row exists **and** `left_at` is
  empty.
- Rejoining inserts a new membership row. The old row stays as history.
- Member count limits count only current members.

## 10. Interface changes

**MCP tool**

`leave_space(space_id, remove_my_content)`:

- `space_id` is always required. The MVP shortcut that fills it in when the
  person has one space does not apply here **(call)**.
- `remove_my_content` defaults to false.
- Marked as a destructive write, so assistants ask the person to confirm.
- If the person is the last member, the tool refuses and says to leave from
  the web page, where the name must be typed **(call)**. An assistant
  should not be able to delete a space in one step.
- Returns a short confirmation of what was done.

**REST**

| Method and path | Purpose |
|---|---|
| `POST /api/spaces/{id}/leave` | body: `remove_content`, and `confirm_name` when the caller is the last member |

`GET /api/spaces/{id}` adds `owner_id`, and each member entry adds whether
they have left.

**Web**

- Space page, members panel: a "Leave space" action for the current person.
- Confirmation dialog: what leaving means, the removal tick, a note when
  the person is the owner ("Ownership will pass to the longest-standing
  member"), and the typed-name step when they are the last member.
- Feed and memory: kept content from a former member shows the "left the
  space" label. Plans show the removed-sources note when it applies.
- Members panel: current members only. The owner is marked.

**Account deletion.** The MVP's delete-account action now runs this same
leave routine with removal for every space the person is in, so the two
paths cannot drift apart.

## 11. Security

- Only the person themselves can end their own membership. The path takes
  no user id.
- The whole leave runs in one transaction, so a failure part-way leaves
  nothing half done.
- Two members leaving at the same moment must not leave an empty space with
  data, or a space with no owner. The transaction takes a write lock on the
  space first.
- After the transaction, no cached membership is trusted. Tokens are not
  revoked, because they belong to the person's whole Orbit account and not
  to one space.
- The removal choice is recorded so a later rejoin does not bring removed
  content back.

## 12. Testing

- A member leaves and every action on that space is then refused, through
  REST and through every MCP tool.
- Keep: items and facts remain, with the label. Remove: items retracted,
  their current facts cleared, other members' content untouched.
- A plan built on a removed item shows the note.
- Owner leaves: ownership moves to the longest-standing member.
- Last member leaves: the space and its data are gone. Wrong typed name is
  refused.
- `leave_space` refuses for the last member and requires `space_id`.
- Two simultaneous leaves end in a valid state.
- Unused invites created by the person are revoked.
- Rejoin by new invite works and does not restore removed content.
- Emails go to remaining members only, and the new owner is told.
- Account deletion produces the same result as leaving every space with
  removal.

## 13. Build order

1. `left_at`, `owner_id` and the migration. Update the membership rule and
   the delete permission. All existing tests still pass.
2. The leave service with the keep path, ownership hand-over and the
   last-member delete.
3. The removal path, cleared facts and the plan note.
4. REST route, `leave_space` tool, `member_left` event, emails.
5. Web: the action, the dialog, the labels.
6. Point account deletion at the leave routine.

## 14. Calls made in this document

1. Keep is the default, and removal is a choice at the moment of leaving.
2. A kept item keeps the person's name, with a "left the space" label.
3. Removal clears facts they set and does not restore older values.
4. Unused invites they created are revoked.
5. Ownership passes to the longest-standing member.
6. The last member must type the space's name, and can only do so on the
   web page.
7. `leave_space` always needs an explicit `space_id`.

## 15. Left to the builder

- Wording of the dialog, labels and emails.
- How the write lock is taken on SQLite.
- Whether cleared facts appear in the memory history as "removed".
