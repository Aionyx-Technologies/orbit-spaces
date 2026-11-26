import type { AiUses } from "@/lib/api.types";

export type AiUsesNoteProps = Readonly<{
  uses: AiUses;
  billingEnabled?: boolean;
  className?: string;
}>;
