"use client";

import type { TemplateChipsProps } from "@/components/spaces/new-space/template-chips.types";

export function TemplateChips({ templates, selected, onChoose, disabled }: TemplateChipsProps) {
  return (
    <div
      role="group"
      aria-label="Starting points"
      className="-mx-6 flex [scrollbar-width:none] gap-2 overflow-x-auto px-6 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          aria-pressed={selected === template.id}
          disabled={disabled}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground motion-safe:transition-colors"
          onClick={() => onChoose(template)}
        >
          {template.icon ? (
            <>
              <span className="text-base leading-none">{template.icon}</span>{" "}
            </>
          ) : null}
          {template.name}
        </button>
      ))}
    </div>
  );
}
