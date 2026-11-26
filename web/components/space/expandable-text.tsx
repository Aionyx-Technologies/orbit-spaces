"use client";

import { useId, useState } from "react";

import type { ExpandableTextProps } from "@/components/space/expandable-text.types";
import { COLLAPSE_AFTER_CHARACTERS, COLLAPSE_AFTER_LINES } from "@/lib/constants";
import { needsCollapse } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ExpandableText({ text, className }: ExpandableTextProps) {
  const collapsible = needsCollapse(text, COLLAPSE_AFTER_CHARACTERS, COLLAPSE_AFTER_LINES);
  const [expanded, setExpanded] = useState(false);
  const textId = useId();

  return (
    <div className={className}>
      <p
        id={textId}
        className={cn(
          "break-words whitespace-pre-wrap",
          collapsible && !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
