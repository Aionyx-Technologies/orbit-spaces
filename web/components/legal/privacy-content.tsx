import { LegalSection } from "@/components/legal/legal-section";
import { OperatorCard } from "@/components/legal/operator-card";
import type { PrivacyContentProps } from "@/components/legal/privacy-content.types";
import { COMPANY } from "@/lib/legal";

export function PrivacyContent({ details }: PrivacyContentProps) {
  return (
    <>
      <p className="text-lg text-pretty text-muted-foreground">
        Orbit lets people who use different AI assistants share what they choose into a shared
        space. This policy says who is responsible for your information, what we collect, why, and
        the choices you have. The details of exactly what is stored are in the{" "}
        <a href="/data-policy" className="underline underline-offset-4">
          data policy
        </a>
        .
      </p>

      <LegalSection title="Who runs Orbit">
        <p>
          Orbit is a product of {COMPANY.name}, {COMPANY.description}. We decide how your
          information is used, and we are responsible for it.
        </p>
        <OperatorCard details={details} />
      </LegalSection>

      <LegalSection title="What is collected, and why">
        <ul>
          <li>
            Your email address and name, to sign you in and to show other members who shared what.
          </li>
          <li>
            An optional photo and a short about line, shown only to people who share a space with
            you, and your photo and name on an invitation you send.
          </li>
          <li>
            What you choose to share into a space: notes and facts. It is shown to the members of
            that space and nobody else.
          </li>
          <li>
            Records that keep you signed in and keep your assistants connected, so you do not have
            to sign in again every time, and the name of the browser you last signed in with.
          </li>
          <li>
            Your email address again when Orbit sends you a sign-in link, an invite, or a
            notification about a space you belong to.
          </li>
        </ul>
        <p>
          Orbit has no advertising and no analytics, and it does not collect anything from your
          assistant that you did not ask it to share.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <ul>
          <li>To run Orbit: sign you in, show your spaces, send the emails you asked for.</li>
          <li>To combine what members shared into a plan, when a member asks.</li>
          <li>To keep Orbit secure, stop abuse, and fix problems.</li>
          <li>To answer you when you contact us.</li>
          <li>To meet our legal obligations.</li>
        </ul>
        <p>
          We do not sell or rent your information, we do not share it for advertising, and we do not
          use what you share to train AI models.
        </p>
      </LegalSection>

      <LegalSection title="Who else receives it">
        <p>
          We use a small number of service providers who handle information only on our behalf and
          only to provide their service to us:
        </p>
        <ul>
          <li>Our email provider, which sends the messages Orbit asks it to send.</li>
          <li>
            Google Cloud, whose Gemini models on Vertex AI power the “Combine” button. It receives a
            space’s facts, recent notes and template only when a member asks Orbit to combine them,
            and the sentence someone types to describe a new space, so it can suggest a name, a
            description and facts. Google does not use this data to train its models. To answer
            faster, Google may keep a temporary copy for up to 24 hours, and it may log requests to
            detect abuse of its service.
          </li>
          <li>
            If this server takes payments, Stripe processes payments for us. You enter your card
            details on Stripe’s pages, and they never reach Orbit. Orbit keeps only your Stripe
            customer id, subscription id, plan, status, billing dates and a record of any credits
            you bought, with Stripe’s payment reference for each. Stripe keeps its own records under
            its own policy.
          </li>
          <li>Our hosting provider, and the storage provider that keeps our backups.</li>
          <li>
            Our error-tracking provider, which receives error details with personal details removed.
          </li>
        </ul>
        <p>
          The assistants you connect receive whatever you ask them to read. Their own makers’
          policies apply to what they do with it. We may also disclose information if the law
          requires it, to protect the safety or rights of people or of Orbit, or as part of a
          merger, acquisition or sale of Aionyx or Orbit, in which case this policy keeps applying
          to it.
        </p>
      </LegalSection>

      <LegalSection title="Where your data is stored">
        <p>
          Orbit is run from the United States, and your information is processed there. If you use
          Orbit from elsewhere, your information is transferred to the United States. Where the box
          under “Who runs Orbit” names a location, that is where the database is kept. Backups are
          stored with a separate storage provider and kept for 14 days, so something you delete can
          remain in a backup for that long.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Until you delete it or delete your account. Sign-in links expire after 15 minutes and
          sessions after 30 days. Deleting takes effect right away in the live database, and backups
          expire 14 days later.
        </p>
      </LegalSection>

      <LegalSection title="Keeping it safe">
        <p>
          Connections to Orbit are encrypted. Sign-in links, sessions and assistant access keys are
          stored only in scrambled form. Every read and write checks that you belong to the space.
          No system is perfectly secure, so if we learn of a breach that affects your information,
          we will tell you without undue delay, as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and rights">
        <ul>
          <li>Export any space you belong to, from the space menu.</li>
          <li>Download a copy of all your data as one file, under Settings.</li>
          <li>Retract something you shared, which erases its text.</li>
          <li>Delete a space you created, or your whole account, under Settings.</li>
          <li>
            If this server takes payments, deleting your account asks Stripe to cancel your
            subscription and remove your Stripe customer. If Stripe cannot be reached, the deletion
            is refused and you can try again later. Stripe may keep its own records. Your data
            download includes your plan and credit records, but never Stripe ids.
          </li>
          <li>
            Disconnect an assistant on the Assistants tab. Under Settings, change or remove your
            photo and about line, choose how often you get email, or turn it off for a space.
          </li>
        </ul>
        <p>
          Depending on where you live, including in the European Union, the United Kingdom and
          California, you may have the right to know what we hold about you, to get a copy, to
          correct it, to delete it, to move it elsewhere, and to object to or limit how we use it.
          To use any of these rights, email{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. We will reply
          within 30 days and will not treat you differently for asking. You may also complain to
          your local data protection authority.
        </p>
        <p>
          Where European or UK law applies, we use your information because we need it to provide
          Orbit to you, because we have a legitimate interest in keeping Orbit secure, or because
          the law requires it.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Orbit is not meant for anyone under 16, and we do not knowingly collect information from
          them. If you believe a child has signed up, email us and we will delete the account.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          One cookie keeps you signed in. It is sent only to Orbit and lasts 30 days. A second one
          remembers your light or dark theme if you choose one, and lasts a year. There are no
          analytics, advertising or third-party cookies.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy. The date at the top shows when it last changed. For changes
          that matter, we will email you before they take effect. If you do not agree with a change,
          you can export your spaces and delete your account.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about privacy go to {COMPANY.name} at{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. The{" "}
          <a href="/data-policy" className="underline underline-offset-4">
            data policy
          </a>{" "}
          explains each of your controls in full.
        </p>
      </LegalSection>
    </>
  );
}
