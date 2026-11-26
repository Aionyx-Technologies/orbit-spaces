import type { Metadata } from "next";

import { DisclaimerContent } from "@/components/legal/disclaimer-content";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" updated={LEGAL_UPDATED}>
      <DisclaimerContent />
    </LegalPage>
  );
}
