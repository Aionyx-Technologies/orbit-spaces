import type { KeyboardEvent } from "react";

import type { Template, TemplateInput } from "@/lib/api.types";
import { SETTLE_SECTION, TEMPLATE_SECTIONS_MAX } from "@/lib/constants";
import type { TemplateFormValue } from "@/lib/template-form.types";

export const MAX_EDITABLE_SECTIONS = TEMPLATE_SECTIONS_MAX - 1;

function isSettle(section: string): boolean {
  return section.trim().toLowerCase() === SETTLE_SECTION.toLowerCase();
}

export function toFormValue(template: Template | TemplateInput): TemplateFormValue {
  return {
    name: template.name,
    description: template.description,
    facts: template.facts.map((fact) => ({ key: fact.key, hint: fact.hint })),
    sections: template.plan_sections.filter((section) => !isSettle(section)),
    combineHint: template.combine_hint,
    tips: [...template.tips],
  };
}

function nonBlank(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value !== "");
}

export function toTemplateInput(value: TemplateFormValue): TemplateInput {
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    facts: value.facts
      .map((fact) => ({ key: fact.key.trim(), hint: fact.hint.trim() }))
      .filter((fact) => fact.key !== ""),
    plan_sections: [...nonBlank(value.sections), SETTLE_SECTION],
    combine_hint: value.combineHint.trim(),
    tips: nonBlank(value.tips),
  };
}

export function canSaveTemplate(value: TemplateFormValue): boolean {
  return value.name.trim() !== "";
}

export function preventEnterSubmit(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.preventDefault();
  }
}
