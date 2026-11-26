import type { AiUses, CombineResult, Item } from "@/lib/api.types";

export type PlanCardProps = Readonly<{
  spaceId: string;
  plan: Item | null;
  meId: string;
  combineEnabled: boolean;
  sections?: readonly string[];
  aiUses?: AiUses | null;
  billingEnabled?: boolean;
  onCombined: (result: CombineResult) => void;
  onUsesChanged?: () => void;
}>;
