import { LegalSection } from "@/components/legal/legal-section";
import { COMPANY } from "@/lib/legal";

export function DataPolicyContent() {
  return (
    <>
      <p className="text-lg text-pretty text-muted-foreground">
        This page describes in plain words what Orbit stores, who can read it, what leaves our
        servers, and how to remove it. Orbit is run by {COMPANY.name}, which is responsible for your
        information. Our{" "}
        <a href="/privacy" className="underline underline-offset-4">
          privacy page
        </a>{" "}
        explains why we collect it and your rights.
      </p>

      <LegalSection title="What Orbit stores">
        <p>Only what you share, plus the minimum needed to run an account.</p>
        <ul>
          <li>
            <strong>Your account:</strong> your email address, a display name (taken from your email
            address until you change it), and when you joined. Orbit also keeps your time zone, how
            often you want activity emails, and your default space if you chose one.
          </li>
          <li>
            <strong>Your profile photo (optional):</strong> one small square copy of the picture you
            upload, kept in the same database as everything else, so it is in backups too. Location
            and camera details are removed from it. Only you and people who share a space with you
            can see it. It also appears on invitations you send, and anyone holding an invitation
            link can see your name and photo until it is used or expires.
          </li>
          <li>
            <strong>Your about line (optional):</strong> up to 160 characters, shown as plain text
            to people who share a space with you. It is never sent to an assistant and never used
            when combining.
          </li>
          <li>
            <strong>Sign-in:</strong> a one-time sign-in link and a session record. Both are stored
            only as scrambled values, so nobody can read them back. The session record also keeps
            the name of your browser, such as “Chrome”, so Settings can show your last sign-in.
            Links expire after 15 minutes and sessions after 30 days. Used and expired ones are
            cleaned up regularly.
          </li>
          <li>
            <strong>Connected assistants:</strong> which assistants you allowed to connect (for
            example “ChatGPT”), when, and their access keys, also stored scrambled.
          </li>
          <li>
            <strong>Spaces:</strong> the name, who created it, who is in it, and whether you get
            email about it. Each space also holds its template: a short list of suggested facts, the
            headings of the combined plan, a line of guidance on how to combine, and a few tips. It
            starts as a copy of one of Orbit’s built-in templates, or as one you confirmed after
            Orbit drafted it, and any member can edit it.
          </li>
          <li>
            <strong>What you share:</strong> notes (a title and some text) and facts (a short name
            and a value). Each one records who shared it, through which assistant or the web page,
            and when. When a fact changes, the earlier values stay in its history.
          </li>
          <li>
            <strong>Plans written by Orbit:</strong> the combined text, which notes it was based on,
            and when.
          </li>
          <li>
            <strong>Invites:</strong> a scrambled copy of the link, who sent it, the address it was
            sent to if one was given, when it expires, and who accepted it.
          </li>
          <li>
            <strong>Payments (only if this server takes them):</strong> your Stripe customer id,
            subscription id, plan, status, billing dates and a record of any credits you bought,
            with Stripe’s payment reference for each. Card details are entered on Stripe’s pages and
            never reach Orbit.
          </li>
          <li>
            <strong>The waitlist:</strong> email addresses left by people who asked to hear when
            sign-up opens, while sign-up is limited.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What Orbit does not store">
        <ul>
          <li>
            <strong>Anything you did not explicitly share.</strong> Orbit cannot see your
            assistant’s chats or its built-in memory. An assistant only sends Orbit what you ask it
            to share.
          </li>
          <li>
            <strong>Passwords.</strong> There are none. You sign in with an emailed link.
          </li>
          <li>
            <strong>Shared content in logs, error reports or emails.</strong> Logs record which kind
            of page was asked for, never the full address, and never contain notes, facts, access
            keys or sign-in links. Activity emails contain titles and names, never what was written.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who can read what you share">
        <ul>
          <li>
            <strong>The members of the space,</strong> on the web page and through their own
            assistants when they ask.
          </li>
          <li>
            <strong>Aionyx Technologies, which runs Orbit,</strong> can read the database and its
            backups. Only a small number of authorized staff have that access, and only to run,
            secure and support the service, to answer a request from you, or when the law requires
            it. We do not browse what you share.
          </li>
          <li>
            <strong>Nobody else.</strong> Every read and write checks that you belong to the space.
            People outside a space, and members of other spaces, cannot read it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What leaves the server">
        <ul>
          <li>
            <strong>Email:</strong> our email provider receives the emails Orbit sends: sign-in
            links, invites and notifications, either as they happen or as one daily summary,
            whichever you chose.
          </li>
          <li>
            <strong>Combine:</strong> when a member asks Orbit to combine, the space’s current
            facts, its most recent notes, the space’s template (its name, plan headings and guidance
            line) and the instruction the member typed are sent to our AI provider, Google Cloud
            (Gemini models on Vertex AI), for that one request. Nothing is sent until someone asks.
            Neither we nor Google use it to train AI models. Google may keep a temporary copy for up
            to 24 hours to answer faster, and may log requests to detect abuse of its service.
          </li>
          <li>
            <strong>Setting up a space:</strong> when someone describes a new space in a sentence,
            that sentence is sent to Google Cloud in the same way, along with the names,
            descriptions, fact names and plan headings of the built-in templates, so it can suggest
            a name, a description and facts. Nothing is saved until that person creates the space,
            and each person can ask for up to 5 suggestions a day. Nothing else from the space is
            sent, and nothing is sent when someone picks one of the built-in templates instead.
          </li>
          <li>
            <strong>Payments:</strong> if this server takes payments, Stripe is our payment
            processor. It receives what you enter at checkout and keeps its own records under its
            own policy.
          </li>
          <li>
            <strong>Your assistants:</strong> an assistant you connect receives whatever you ask it
            to read from Orbit. What it does with that text is governed by its maker’s policies, not
            Orbit’s.
          </li>
          <li>
            <strong>Error tracking:</strong> error reports sent to our error-tracking provider
            contain the kind of error, its message and the place in the code. Request details,
            cookies, user details and variables are removed first.
          </li>
          <li>
            <strong>Backups:</strong> a copy of the whole database is stored with a separate storage
            provider, for 14 days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How long it is kept">
        <p>
          Until you remove it. Deleting happens right away in the live database. Backups keep what
          was in the database when they were made until they expire, 14 days later.
        </p>
      </LegalSection>

      <LegalSection title="Your controls">
        <ul>
          <li>
            <strong>Retract something you shared.</strong> Its title and text are erased and a
            marker stays so the feed still makes sense. Only the person who shared a note can
            retract it.
          </li>
          <li>
            <strong>Plans written by Orbit</strong> have no sharer, so they cannot be retracted one
            by one, and a plan keeps its text even if a note it was based on is retracted later.
            Deleting the space removes them.
          </li>
          <li>
            <strong>Facts</strong> can be changed but not deleted one by one. The old values stay in
            the fact’s history. Deleting the space removes them.
          </li>
          <li>
            <strong>Export a space.</strong> In the space menu, choose “Export as JSON” to download
            everything in it.
          </li>
          <li>
            <strong>Download all your data.</strong> Under Settings, choose “Download my data” to
            get one JSON file with your account and preferences, every space you belong to with
            everything in it, what you shared and the facts you set, invitations you sent and
            received, connected assistants and your sign-ins. It never includes sign-in links,
            access keys or other people’s email addresses. If this server takes payments, it also
            includes your plan and credit records, and never includes Stripe ids. You can download
            it up to 5 times a day.
          </li>
          <li>
            <strong>Delete a space.</strong> The person who created it can delete it. Its notes,
            facts, invites and memberships are erased, its template is reset to the built-in Blank
            one, and its name is blanked.
          </li>
          <li>
            <strong>Change or remove your photo and about line</strong> under Settings. Removing a
            photo erases it from the live database right away.
          </li>
          <li>
            <strong>Sign out everywhere</strong> under Settings ends every session on every device.
            Connected assistants keep working until you disconnect them on the Assistants tab.
          </li>
          <li>
            <strong>Delete your account</strong> under Settings. Your photo, about line, sessions,
            access keys and memberships are removed. Everything you shared is retracted and its text
            erased. Facts you set stay in the space without your name, and plans written by Orbit
            keep any text that came from what you shared, because they belong to the space. Your
            pending invites are cancelled, invitations that were sent to your email address are
            cancelled and lose the address, and the addresses you invited are erased from
            invitations nobody accepted. If this server takes payments, Orbit first asks Stripe to
            cancel your subscription and remove your Stripe customer. If Stripe cannot be reached,
            the deletion is refused and nothing is deleted, so you are never left paying for an
            account that is gone; try again in a few minutes. Stripe keeps its own records under its
            own policy, and your plan and credit records are deleted from Orbit. Your email address
            is removed from the server. Spaces you created pass to the member who has been in them
            longest, or are deleted if nobody else is in them.
          </li>
          <li>
            <strong>Disconnect an assistant</strong> on the Assistants tab. Its access stops
            immediately.
          </li>
          <li>
            <strong>Choose how often you get activity email</strong> under Settings: as it happens,
            one daily summary at 8:00 in your time zone, or off. You can also turn email off for a
            single space. Sign-in links and invitations are always sent.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Two cookies, both sent only to Orbit. <code>orbit_session</code> keeps you signed in and
          lasts 30 days. <code>orbit-theme</code> remembers whether you chose the light or the dark
          theme. It is set only when you choose one, holds nothing but that word, and lasts a year.
          There are no analytics, advertising or third-party cookies.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Connections to Orbit are encrypted. Sign-in links, sessions and assistant access keys are
          stored only in scrambled form. Every read and write checks that you belong to the space.
          If you find a security problem, please email{" "}
          <a href={`mailto:${COMPANY.securityEmail}`}>{COMPANY.securityEmail}</a> before telling
          anyone else, so we can fix it.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          Questions about your data, or requests to see, correct, export or delete it, go to{" "}
          {COMPANY.name} at <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
          We reply within 30 days. The{" "}
          <a href="/privacy" className="underline underline-offset-4">
            privacy page
          </a>{" "}
          has the full policy.
        </p>
      </LegalSection>
    </>
  );
}
