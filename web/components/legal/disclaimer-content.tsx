import { LegalSection } from "@/components/legal/legal-section";
import { COMPANY } from "@/lib/legal";

export function DisclaimerContent() {
  return (
    <>
      <p className="text-lg text-pretty text-muted-foreground">
        Orbit is a product of {COMPANY.name}, {COMPANY.description}. This page explains the limits
        of what Orbit is and what it promises. It is part of our{" "}
        <a href="/terms" className="underline underline-offset-4">
          terms
        </a>
        .
      </p>

      <LegalSection title="Plans and suggestions are written by AI">
        <p>
          Plans, suggested facts and space set-ups are written by an AI model from what people
          shared. They can be wrong, out of date, incomplete or miss context, and they can sound
          more certain than they are. Check anything important, such as prices, dates, bookings,
          amounts owed or deadlines, before you act on it.
        </p>
      </LegalSection>

      <LegalSection title="Not professional advice">
        <p>
          Nothing in Orbit is legal, financial, tax, medical, travel or other professional advice.
          For decisions that matter, talk to a qualified professional.
        </p>
      </LegalSection>

      <LegalSection title="What people share">
        <p>
          Notes and facts in a space come from its members and their assistants. We do not check
          them and are not responsible for whether they are accurate. The person who shared
          something is responsible for it.
        </p>
      </LegalSection>

      <LegalSection title="Assistants and other services">
        <p>
          Orbit works with AI assistants and other services made by other companies. We do not
          control them, and their own terms and policies apply to them. ChatGPT, Claude, Grok,
          Cursor, Codex and the other assistant names and logos shown on this site belong to their
          owners. They are used only to show which assistants Orbit works with. Orbit is not
          affiliated with, sponsored by or endorsed by any of them.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          Orbit is provided “as is” and “as available”, without warranties of any kind, to the
          extent the law allows. It may sometimes be unavailable or contain mistakes. Export
          anything you cannot afford to lose. The{" "}
          <a href="/terms" className="underline underline-offset-4">
            terms
          </a>{" "}
          set out the limits on our responsibility.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions go to {COMPANY.name} at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </p>
      </LegalSection>
    </>
  );
}
