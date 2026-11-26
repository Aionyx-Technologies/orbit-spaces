import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { LEGAL_UPDATED } from "@/lib/legal";
import { readOperatorDetails } from "@/lib/operator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={LEGAL_UPDATED}>
      <PrivacyContent details={readOperatorDetails()} />
    </LegalPage>
  );
}
