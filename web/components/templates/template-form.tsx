"use client";

import { useId } from "react";

import { FactListEditor } from "@/components/templates/fact-list-editor";
import { StringListEditor } from "@/components/templates/string-list-editor";
import type { TemplateFormProps } from "@/components/templates/template-form.types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SETTLE_SECTION,
  TEMPLATE_COMBINE_HINT_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SECTION_MAX,
  TEMPLATE_TIP_MAX,
  TEMPLATE_TIPS_MAX,
} from "@/lib/constants";
import { MAX_EDITABLE_SECTIONS, preventEnterSubmit } from "@/lib/template-form";
import type { TemplateFormValue } from "@/lib/template-form.types";

export function TemplateForm({ value, onChange }: TemplateFormProps) {
  const base = useId();
  const nameId = `${base}-name`;
  const descriptionId = `${base}-description`;
  const hintId = `${base}-combine-hint`;

  function patch(change: Partial<TemplateFormValue>) {
    onChange({ ...value, ...change });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor={nameId}>Template name</Label>
        <Input
          id={nameId}
          value={value.name}
          maxLength={TEMPLATE_NAME_MAX}
          autoComplete="off"
          onKeyDown={preventEnterSubmit}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={descriptionId}>Description</Label>
        <Input
          id={descriptionId}
          value={value.description}
          maxLength={TEMPLATE_DESCRIPTION_MAX}
          autoComplete="off"
          onKeyDown={preventEnterSubmit}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </div>
      <FactListEditor facts={value.facts} onChange={(facts) => patch({ facts })} />
      <StringListEditor
        legend="Plan sections"
        itemLabel="Section"
        addLabel="Add a section"
        values={value.sections}
        onChange={(sections) => patch({ sections })}
        max={MAX_EDITABLE_SECTIONS}
        maxLength={TEMPLATE_SECTION_MAX}
        placeholder="Where to stay"
        movable
        trailing={
          <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/40 px-3.5 py-2.5 text-base">
            <span className="font-medium">{SETTLE_SECTION}</span>
            <span className="text-sm text-muted-foreground">Orbit always adds this last</span>
          </li>
        }
      />
      <div className="grid gap-2">
        <Label htmlFor={hintId}>How to combine</Label>
        <Textarea
          id={hintId}
          value={value.combineHint}
          maxLength={TEMPLATE_COMBINE_HINT_MAX}
          placeholder="Balance everyone's preferences and stay within the budget."
          className="min-h-20"
          onChange={(event) => patch({ combineHint: event.target.value })}
        />
      </div>
      <StringListEditor
        legend="Tips for an empty space"
        itemLabel="Tip"
        addLabel="Add a tip"
        values={value.tips}
        onChange={(tips) => patch({ tips })}
        max={TEMPLATE_TIPS_MAX}
        maxLength={TEMPLATE_TIP_MAX}
        placeholder="Set the budget"
      />
    </div>
  );
}
