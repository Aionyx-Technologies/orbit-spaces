import type { TemplateFact } from "@/lib/api.types";

export type TemplateFormValue = {
  name: string;
  description: string;
  facts: TemplateFact[];
  sections: string[];
  combineHint: string;
  tips: string[];
};
