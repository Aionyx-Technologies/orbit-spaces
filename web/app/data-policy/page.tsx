import type { Metadata } from "next";

import { DataPolicyContent } from "@/components/legal/data-policy-content";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Data policy" };

export default function DataPolicyPage() {
  return (
    <LegalPage title="Data policy" updated={LEGAL_UPDATED}>
      <DataPolicyContent />
    </LegalPage>
  );
}
