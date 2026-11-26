"use client";

import { PlusIcon, XIcon } from "lucide-react";

import type { FactListEditorProps } from "@/components/templates/fact-list-editor.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TemplateFact } from "@/lib/api.types";
import { FACT_KEY_MAX, TEMPLATE_FACT_HINT_MAX, TEMPLATE_FACTS_MAX } from "@/lib/constants";
import { preventEnterSubmit } from "@/lib/template-form";

export function FactListEditor({ facts, onChange }: FactListEditorProps) {
  function patch(index: number, change: Partial<TemplateFact>) {
    onChange(facts.map((fact, at) => (at === index ? { ...fact, ...change } : fact)));
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Suggested facts</legend>
      <ul className="grid gap-3">
        {facts.map((fact, index) => (
          <li key={index} className="flex items-start gap-1.5">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <Input
                aria-label={`Fact ${index + 1} name`}
                value={fact.key}
                maxLength={FACT_KEY_MAX}
                placeholder="Budget"
                autoComplete="off"
                onKeyDown={preventEnterSubmit}
                onChange={(event) => patch(index, { key: event.target.value })}
              />
              <Input
                aria-label={`Fact ${index + 1} hint`}
                value={fact.hint}
                maxLength={TEMPLATE_FACT_HINT_MAX}
                placeholder="What to enter"
                autoComplete="off"
                onKeyDown={preventEnterSubmit}
                onChange={(event) => patch(index, { hint: event.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove fact ${index + 1}`}
              className="mt-1 text-muted-foreground"
              onClick={() => onChange(facts.filter((_, at) => at !== index))}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        disabled={facts.length >= TEMPLATE_FACTS_MAX}
        onClick={() => onChange([...facts, { key: "", hint: "" }])}
      >
        <PlusIcon aria-hidden="true" />
        Add a suggested fact
      </Button>
    </fieldset>
  );
}
