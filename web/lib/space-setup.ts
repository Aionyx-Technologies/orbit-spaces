import type { CreateSpaceFact, SuggestedFact, Template } from "@/lib/api.types";
import type { FactRow } from "@/lib/space-setup.types";
import type { TemplateFormValue } from "@/lib/template-form.types";

export const CHIP_PLACEHOLDERS: Record<string, string> = {
  trip: "Hawaii trip",
  "holiday-gifts": "Family Christmas",
  household: "Flat 4B",
  "dinner-party": "Friendsgiving",
  event: "Sam's 30th",
  "freelancer-client": "Website redesign",
  "team-project": "Q1 launch",
  general: "Book club",
};

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function emptyRow(key: string, hint: string): FactRow {
  return { key, hint, value: "", on: false, suggested: false };
}

export function rowsFromTemplate(template: Template, facts: SuggestedFact[] = []): FactRow[] {
  return template.facts.map((fact) => {
    const match = facts.find((suggested) => sameKey(suggested.key, fact.key));
    if (!match || isBlank(match.value)) {
      return emptyRow(fact.key, fact.hint);
    }
    return { key: fact.key, hint: fact.hint, value: match.value, on: true, suggested: true };
  });
}

export function editRowValue(row: FactRow, value: string): FactRow {
  const on = isBlank(value) ? false : isBlank(row.value) ? true : row.on;
  return { ...row, value, on, suggested: false };
}

export function toggleRow(row: FactRow): FactRow {
  return isBlank(row.value) ? row : { ...row, on: !row.on };
}

export function factsToSend(rows: FactRow[]): CreateSpaceFact[] {
  return rows
    .filter((row) => row.on && !isBlank(row.value))
    .map((row) => ({ key: row.key, value: row.value.trim(), suggested: row.suggested }));
}

export function syncRowsWithTemplate(rows: FactRow[], template: TemplateFormValue): FactRow[] {
  const synced: FactRow[] = [];
  for (const fact of template.facts) {
    const key = fact.key.trim();
    if (key === "" || synced.some((row) => sameKey(row.key, key))) {
      continue;
    }
    const existing = rows.find((row) => sameKey(row.key, key));
    synced.push(existing ? { ...existing, key, hint: fact.hint } : emptyRow(key, fact.hint));
  }
  return synced;
}
