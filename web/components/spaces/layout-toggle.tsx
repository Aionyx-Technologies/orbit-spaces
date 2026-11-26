import { LayoutGridIcon, ListIcon } from "lucide-react";

import type { LayoutToggleProps } from "@/components/spaces/spaces-toolbar.types";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "grid", label: "Grid view", Icon: LayoutGridIcon },
  { value: "list", label: "List view", Icon: ListIcon },
] as const;

export function LayoutToggle({ value, onChange }: LayoutToggleProps) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex rounded-full border bg-surface-2/80 p-1"
    >
      {OPTIONS.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          aria-label={label}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground motion-safe:transition-colors",
            value === option && "border border-line-strong bg-card text-foreground shadow-card",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </div>
  );
}
