import type { Fact, FactResult, TemplateFact } from "@/lib/api.types";

export type MemoryCardProps = Readonly<{
  spaceId: string;
  facts: Fact[];
  unsetFacts?: TemplateFact[];
  meId: string;
  /* previousKey is set when the save renamed the fact. */
  onSaved: (result: FactResult, previousKey?: string) => void;
  onDeleted: (key: string) => void;
}>;

export type FactEditing =
  { mode: "none" } | { mode: "add"; suggested?: TemplateFact } | { mode: "edit"; fact: Fact };
