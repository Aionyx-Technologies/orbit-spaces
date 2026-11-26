import type { TemplateFormValue } from "@/lib/template-form.types";

export type TemplateFormProps = Readonly<{
  value: TemplateFormValue;
  onChange: (value: TemplateFormValue) => void;
}>;
