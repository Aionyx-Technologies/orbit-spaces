import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { TermsContent } from "@/components/legal/terms-content";
import { LEGAL_UPDATED } from "@/lib/legal";
import { readOperatorDetails } from "@/lib/operator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated={LEGAL_UPDATED}>
      <TermsContent details={readOperatorDetails()} />
    </LegalPage>
  );
}
