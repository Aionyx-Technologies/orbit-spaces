import type { Ref } from "react";

import type { FactRow } from "@/lib/space-setup.types";
import type { TemplateFormValue } from "@/lib/template-form.types";

export type SuggestionPanelProps = Readonly<{
  suggested: boolean;
  name: string;
  namePlaceholder: string;
  nameRef: Ref<HTMLInputElement>;
  onNameChange: (name: string) => void;
  template: TemplateFormValue;
  onTemplateChange: (template: TemplateFormValue) => void;
  rows: FactRow[];
  onRowsChange: (rows: FactRow[]) => void;
  customizing: boolean;
  onCustomizingChange: (customizing: boolean) => void;
  error: string | null;
  canCreate: boolean;
  pending: boolean;
}>;
