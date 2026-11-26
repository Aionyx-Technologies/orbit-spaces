import type { AiUses, EmailUses } from "@/lib/api.types";

export type UsageMetersProps = Readonly<{
  aiUses: AiUses;
  instantEmails: EmailUses | null;
  aiPackCredits?: number;
  emailPackCredits?: number;
}>;
