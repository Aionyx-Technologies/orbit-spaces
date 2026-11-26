import type { TemplateFact } from "@/lib/api.types";

export type FactListEditorProps = Readonly<{
  facts: TemplateFact[];
  onChange: (facts: TemplateFact[]) => void;
}>;
