# Data policy

This is a plain-English description of what an Orbit server stores, who can read it, what leaves the server, and how to remove it. It describes the software. The person who runs a particular Orbit server is responsible for how that server is run, and their details appear on that server's privacy page.

## What Orbit stores

Only what you share, plus the minimum needed to run an account.

- **Your account:** your email address, a display name (taken from your email address until you change it), and when you joined. Orbit also keeps your time zone, how often you want activity emails, and your default space if you chose one.
- **Your profile photo (optional):** one small square copy of the picture you upload, kept in the same database as everything else, so it is in backups too. Location and camera details are removed from it. Only you and people who share a space with you can see it. It also appears on invitations you send, and anyone holding an invitation link can see your name and photo until it is used or expires.
- **Your about line (optional):** up to 160 characters, shown as plain text to people who share a space with you. It is never sent to an assistant and never used when combining.
- **Sign-in:** a one-time sign-in link and a session record. Both are stored only as hashes, so nobody can read them back. The session record also keeps the name of your browser, such as "Chrome", so Settings can show your last sign-in. Links expire after 15 minutes and sessions after 30 days. Spent and expired ones are cleaned up regularly.
- **Connected assistants:** which assistants you allowed to connect (for example "ChatGPT"), when, and their access tokens as hashes.
- **Spaces:** the name, who created it, who is in it, and whether you get email about it. Each space also holds its template: a short list of suggested facts, the headings of the combined plan, a line of guidance on how to combine, and a few tips. It starts as a copy of one of Orbit's built-in templates, or as one you confirmed after Orbit drafted it, and any member can edit it.
- **What you share:** items (a title and some text) and facts (a short key and a value). Each one records who shared it, through which assistant or the web page, and when. When a fact changes, the earlier values stay in its history.
- **Plans written by Orbit:** the combined text, which items it was based on, and when.
- **Invites:** a hash of the link, who sent it, the address it was sent to if one was given, when it expires, and who accepted it.
- **Payments (only if this server takes them):** your Stripe customer id, subscription id, plan, status, billing dates and a record of any credits you bought, with Stripe's payment reference for each. Card details are entered on Stripe's pages and never reach Orbit. Stripe is our payment processor and keeps its own records under its own policy. Deleting your account first asks Stripe to cancel your subscription and remove your Stripe customer, then deletes your plan and credit records from Orbit. If Stripe cannot be reached, the deletion is refused and nothing is deleted; you can try again a few minutes later.
- **The waitlist:** email addresses left by people who asked to be told when sign-up opens, if the server limits who can join.

## What Orbit does not store

- **Anything you did not explicitly share.** Orbit cannot see your assistant's chats or built-in memory. An assistant only sends Orbit what you ask it to share.
- **Passwords.** There are none. You sign in with an emailed link.
- **Shared content in logs, error reports or emails.** Logs record which kind of page was asked for, never the full address, and never contain items, facts, tokens or sign-in links. Activity emails contain titles and names, never what was written.

## Who can read what you share

- **The members of the space,** on the web page and through their own assistants when they ask.
- **The person who runs the server** can read the database and its backups. That is true of any hosted service, so share only with a server whose operator you trust.
- **Nobody else.** Every read and write checks that you belong to the space. People outside a space, and members of other spaces, cannot read it.

## What leaves the server

- **Email:** the server's mail provider receives the emails Orbit sends: sign-in links, invites, and notifications, either as they happen or as one daily summary, whichever you chose.
- **Combine:** if the operator has set up an AI provider (Anthropic, Google Gemini, an OpenAI-compatible service, or a model the operator runs themselves) and a member asks Orbit to combine, the space's current facts, its most recent items, the space's template (its name, plan headings and guidance line) and the instruction the member typed are sent to that provider's API for that one request. Nothing is sent until someone asks.
- **Setting up a space:** if the operator has set up an AI provider and someone describes a new space in a sentence, that sentence is sent to that provider's API, along with the names, descriptions, fact names and plan headings of the built-in templates, so it can suggest a name, a description and facts. Nothing is saved until that person creates the space, and each person can ask for up to 5 suggestions a day. Nothing else from the space is sent, and nothing is sent when someone picks one of the built-in templates instead.
- **Payments:** if this server takes payments, Stripe is our payment processor. It receives what you enter at checkout and keeps its own records under its own policy.
- **Your assistants:** an assistant that you connect receives whatever you ask it to read from Orbit. What it does with that text is governed by its vendor's policies, not Orbit's.
- **Error tracking:** if the operator turned it on, error reports contain the kind of error, its message and the place in the code. Request bodies, cookies, headers, query strings, user details and variables are removed first.
- **Backups:** if the operator turned them on, a copy of the whole database is stored in object storage the operator chose, for 14 days by default.

## How long it is kept

Until you remove it. Deleting happens right away in the live database. Backups keep what was in the database when they were made until they expire, 14 days by default.

## Your controls

- **Retract something you shared.** Its title and text are erased and a marker stays so the feed still makes sense. Only the person who shared an item can retract it.
- **Plans written by Orbit** have no sharer, so they cannot be retracted one by one, and a plan keeps its text even if an item it was based on is retracted later. Deleting the space removes them.
- **Facts** can be changed but not deleted one by one. The old values stay in the fact's history. Deleting the space removes them.
- **Export a space.** In the space menu, choose **Export as JSON** to download everything in it.
- **Download all your data.** Under **Settings**, choose **Download my data** to get one JSON file with your account and preferences, every space you belong to with everything in it, what you shared and the facts you set, invitations you sent and received, connected assistants and your sign-ins. It never includes sign-in links, access keys or other people's email addresses. If this server takes payments, it also includes your plan and credit records, and never includes Stripe ids. You can download it up to 5 times a day.
- **Delete a space.** The person who created it can delete it. Its items, facts, invites and memberships are erased, its template is reset to the built-in General one, and its name is blanked.
- **Change or remove your photo and about line** under **Settings**. Removing a photo erases it from the live database right away.
- **Sign out everywhere** under **Settings** ends every session on every device. Connected assistants keep working until you disconnect them on the **Assistants** tab.
- **Delete your account** under **Settings**. Your photo, about line, sessions, tokens and memberships are removed. Everything you shared is retracted and its text erased. Facts you set stay in the space without your name. Your pending invites are cancelled, invitations that were sent to your email address are cancelled and lose the address, and the addresses you invited are erased from invitations nobody accepted. If this server takes payments, Orbit first asks Stripe to cancel your subscription and remove your Stripe customer; if Stripe cannot be reached, the deletion is refused and nothing is deleted, so you are never left paying for an account that is gone, and you can try again a few minutes later. Stripe keeps its own records under its own policy. Your email address is removed from the server. Plans written by Orbit keep any text that came from what you shared, and facts you set keep their text, because they belong to the space. Spaces you created pass to the member who has been in them longest, or are deleted if nobody else is in them.
- **Disconnect an assistant** on the **Assistants** tab. Its access stops immediately.
- **Choose how often you get activity email** under **Settings**: as it happens, one daily summary at 8:00 in your time zone, or off. You can also turn email off for a single space. Sign-in links and invitations are always sent.

## Cookies

Two cookies, both sent only to Orbit. `orbit_session` keeps you signed in. It is HTTP-only and lasts 30 days. `orbit-theme` remembers whether you chose the light or the dark theme. It is set only when you choose one, holds nothing but that word, and lasts a year. There are no analytics, advertising or third-party cookies.

## Questions

Questions about a particular server go to the person who runs it. Their name, contact address and where the data is stored are on that server's privacy page.
