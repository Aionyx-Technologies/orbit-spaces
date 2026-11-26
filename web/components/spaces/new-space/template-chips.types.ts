import type { Template } from "@/lib/api.types";

export type TemplateChipsProps = Readonly<{
  templates: Template[];
  selected: string | null;
  onChoose: (template: Template) => void;
  disabled?: boolean;
}>;
