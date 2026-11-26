"use client";

import { PencilIcon } from "lucide-react";
import { useId } from "react";

import { ErrorNotice } from "@/components/common/error-notice";
import { FactRow } from "@/components/spaces/new-space/fact-row";
import type { SuggestionPanelProps } from "@/components/spaces/new-space/suggestion-panel.types";
import { TemplateForm } from "@/components/templates/template-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPACE_NAME_MAX } from "@/lib/constants";

export function SuggestionPanel({
  suggested,
  name,
  namePlaceholder,
  nameRef,
  onNameChange,
  template,
  onTemplateChange,
  rows,
  onRowsChange,
  customizing,
  onCustomizingChange,
  error,
  canCreate,
  pending,
}: SuggestionPanelProps) {
  const base = useId();
  const nameId = `${base}-name`;
  const formId = `${base}-customize`;
  const sections = template.sections.map((section) => section.trim()).filter(Boolean);

  return (
    <div className="grid gap-4 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <Input
              ref={nameRef}
              id={nameId}
              name="name"
              value={name}
              maxLength={SPACE_NAME_MAX}
              placeholder={namePlaceholder}
              autoComplete="off"
              required
              className="field-sizing-content h-10 w-auto max-w-full min-w-24 border-transparent bg-transparent px-2 text-lg font-semibold tracking-tight shadow-none placeholder:font-normal hover:border-input"
              onChange={(event) => onNameChange(event.target.value)}
            />
            <label
              htmlFor={nameId}
              className="-ml-1 inline-flex size-8 shrink-0 cursor-text items-center justify-center text-muted-foreground"
            >
              <PencilIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Space name</span>
            </label>
          </div>
          {template.description.trim() ? (
            <p className="px-2 text-sm text-muted-foreground">{template.description}</p>
          ) : null}
        </div>
        {suggested ? (
          <Badge variant="ember" className="mt-2.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-ember" />
            Suggested
          </Badge>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <ul aria-label="Facts" className="grid px-2">
          {rows.map((row, index) => (
            <FactRow
              key={row.key}
              row={row}
              onChange={(next) =>
                onRowsChange(rows.map((each, at) => (at === index ? next : each)))
              }
            />
          ))}
        </ul>
      ) : null}
      {sections.length > 0 ? (
        <p className="px-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Plan:</span> {sections.join(" · ")}
        </p>
      ) : null}
      {customizing ? (
        <div id={formId} className="rounded-lg border border-border bg-muted/50 p-4">
          <TemplateForm value={template} onChange={onTemplateChange} />
        </div>
      ) : null}
      <ErrorNotice message={error} />
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="-ml-3 text-muted-foreground"
          aria-expanded={customizing}
          aria-controls={customizing ? formId : undefined}
          onClick={() => onCustomizingChange(!customizing)}
        >
          Customize
        </Button>
        <Button type="submit" disabled={!canCreate}>
          {pending ? "Creating…" : "Create space"}
        </Button>
      </div>
    </div>
  );
}
