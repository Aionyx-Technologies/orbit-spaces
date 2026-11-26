import { LegalSection } from "@/components/legal/legal-section";
import { OperatorCard } from "@/components/legal/operator-card";
import type { TermsContentProps } from "@/components/legal/terms-content.types";
import { COMPANY, SOURCE_URL } from "@/lib/legal";

export function TermsContent({ details }: TermsContentProps) {
  return (
    <>
      <p className="text-lg text-pretty text-muted-foreground">
        These terms are an agreement between you and {COMPANY.name}, {COMPANY.description}
        (“Aionyx”, “we” or “us”), the company behind Orbit. They are written to be read. By creating
        an account or using Orbit, you agree to them.
      </p>

      <LegalSection title="What Orbit is">
        <p>
          Orbit lets people who use different AI assistants share what they choose into a shared
          space, read it back through any assistant or on the web, and ask Orbit to combine it into
          a plan. Orbit is a product of {COMPANY.name}.
        </p>
      </LegalSection>

      <LegalSection title="Who can use it">
        <ul>
          <li>You must be at least 16 years old.</li>
          <li>
            You must give an email address you control. You are responsible for your account, for
            keeping access to your email secure, and for what is done with your account.
          </li>
          <li>
            If you use Orbit on behalf of an organization, you confirm that you are allowed to
            accept these terms for it.
          </li>
          <li>When sign-up is limited, you need an invitation to join.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What you share">
        <ul>
          <li>You keep ownership of what you share.</li>
          <li>
            You give us permission to store, copy, process and show what you share only as needed to
            run Orbit for you and the members of your spaces. That includes sending it to the AI
            provider we use when a member asks Orbit to combine. This permission ends when you
            delete it, except for copies in backups until they expire.
          </li>
          <li>We do not sell what you share, and we do not use it to advertise to you.</li>
          <li>
            Only share what you have the right to share. Do not share passwords, secrets, payment
            card numbers, health records, government ID numbers, or other people’s confidential
            information.
          </li>
          <li>
            Everyone in a space can read what you share there until you retract it. Retracting
            erases the text of a note, but not text that Orbit has already used in a plan.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Plans written by Orbit">
        <p>
          A plan is written by an AI model from what the members shared. It can be wrong, incomplete
          or miss context. Check it before you act on it. It is not professional advice. See the{" "}
          <a href="/disclaimer">disclaimer</a> for more.
        </p>
      </LegalSection>

      <LegalSection title="Your assistants and other services">
        <p>
          When you connect an assistant, you allow it to read your spaces and, when you ask it to,
          to write to them. Assistants are made by other companies. Their own terms and policies
          apply to them, and we are not responsible for what an assistant does with what it reads.
          You can disconnect an assistant at any time on the Assistants tab.
        </p>
      </LegalSection>

      <LegalSection title="Using it fairly">
        <p>Do not use Orbit to:</p>
        <ul>
          <li>break the law or infringe anyone’s rights;</li>
          <li>harass, threaten, or share hateful, violent or sexual content involving minors;</li>
          <li>send spam or unwanted invitations;</li>
          <li>try to reach spaces or accounts you do not belong to;</li>
          <li>probe, scan, attack or overload the service, or get around its limits;</li>
          <li>copy, resell or rebrand the hosted service without our written permission.</li>
        </ul>
        <p>
          The limits in the app, such as how large a note can be and how often you can combine, are
          there on purpose.
        </p>
      </LegalSection>

      <LegalSection title="Open-source software">
        <p>
          Orbit’s source code is published under the GNU Affero General Public License v3.0
          (AGPL-3.0-only), and you can get it at{" "}
          <a href={SOURCE_URL} className="underline underline-offset-4">
            {SOURCE_URL.replace("https://", "")}
          </a>
          . That license covers the code. These terms cover your use of the Orbit service we run. If
          you run your own copy, you are the operator of that copy and these terms do not apply to
          it.
        </p>
      </LegalSection>

      <LegalSection title="Price">
        <p>
          Orbit is free to use. Optional paid plans are described under “Paid plans” below. We will
          tell you the price before anything is charged, and nothing you already use will start
          costing money without your agreement.
        </p>
      </LegalSection>

      <LegalSection title="Paid plans">
        <p>
          If this server takes payments, it offers a Plus subscription and packs of extra AI uses
          and instant update emails, paid through Stripe.
        </p>
        <ul>
          <li>
            Plus is a subscription, billed monthly or yearly. A pack is a one-time purchase. The
            person who pays is the organizer. Joining a space is always free.
          </li>
          <li>
            You can cancel at any time under Settings or in the Stripe portal. You keep Plus until
            the end of the period you paid for, and then your account goes back to Free. A space
            that has more members than Free allows keeps them but cannot add more.
          </li>
          <li>
            Credits from a pack are valid for 12 months from the day you buy them. A full refund
            removes the credits you have not used. Credits you already used stay used.
          </li>
          <li>
            Stripe shows the price and any tax at checkout. Your card details are entered on
            Stripe’s pages and never reach Orbit.
          </li>
          <li>The operator of the server is responsible for any tax on what it sells.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Changes to the service">
        <p>
          We improve Orbit all the time, so features may change, be added or be removed. If we plan
          to shut down the service, we will tell you by email at least 30 days ahead so you can
          export your spaces.
        </p>
      </LegalSection>

      <LegalSection title="Ending">
        <p>
          You can stop using Orbit and delete your account at any time under Settings. We may
          suspend or close an account that breaks these terms, puts others at risk, or where the law
          requires it. Where it is reasonable, we will tell you why and give you a chance to export
          your spaces first.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          Orbit is provided “as is” and “as available”. To the extent the law allows, we make no
          promises, express or implied, that it will always be available, free of mistakes, secure
          from every threat, or fit for a particular purpose. Export anything you cannot afford to
          lose.
        </p>
      </LegalSection>

      <LegalSection title="Limits on our responsibility">
        <p>
          To the extent the law allows, Aionyx, its officers, employees and suppliers are not
          responsible for indirect, incidental, special, consequential or punitive losses, or for
          lost profits, data or goodwill, that come from using or being unable to use Orbit. Our
          total responsibility for any claim about Orbit is limited to the greater of the amount you
          paid us for Orbit in the 12 months before the claim, or 100 US dollars. Nothing here
          limits rights that the law says cannot be limited.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibility">
        <p>
          If someone makes a claim against us because of what you shared or because you broke these
          terms, you agree to cover our reasonable costs of dealing with it, to the extent the law
          allows.
        </p>
      </LegalSection>

      <LegalSection title="Law and disputes">
        <p>
          These terms are governed by the laws of the State of Delaware, USA, without regard to its
          conflict-of-law rules. Any dispute will be handled in the state or federal courts located
          in Delaware, and you and we agree to their jurisdiction. If you live in a country whose
          law gives you the right to bring a claim where you live, you keep that right. Before going
          to court, please email us so we can try to sort it out.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. The date at the top shows when they last changed. For changes
          that matter, we will email you at least 14 days before they take effect. If you keep using
          Orbit after that, you accept the new terms. If you do not agree, you can export your
          spaces and delete your account.
        </p>
      </LegalSection>

      <LegalSection title="The rest">
        <p>
          These terms, the <a href="/privacy">privacy policy</a> and the{" "}
          <a href="/data-policy">data policy</a> are the whole agreement between you and us about
          Orbit. If part of them cannot be enforced, the rest still applies. If we do not enforce a
          part straight away, we have not given it up. You may not transfer these terms to someone
          else. We may transfer them if Aionyx or Orbit is reorganized, merged or sold, and we will
          tell you if that happens.
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <OperatorCard details={details} />
      </LegalSection>
    </>
  );
}
