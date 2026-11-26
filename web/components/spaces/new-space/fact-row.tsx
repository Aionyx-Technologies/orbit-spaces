"use client";

import { useEffect, useRef, useState } from "react";

import type { FactRowProps } from "@/components/spaces/new-space/fact-row.types";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FACT_VALUE_MAX } from "@/lib/constants";
import { editRowValue, toggleRow } from "@/lib/space-setup";

const NOT_SET = "Not set yet";

export function FactRow({ row, onChange }: FactRowProps) {
  const [editing, setEditing] = useState(false);
  const valueButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const before = useRef(row);
  const value = row.value.trim();

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      valueButton.current?.focus();
    }
  }, [editing]);

  function finish(returnFocus: boolean) {
    refocus.current = returnFocus;
    setEditing(false);
  }

  return (
    <li className="flex min-h-13 items-center gap-3 border-t border-border py-1.5 first:border-t-0">
      <span className="w-24 shrink-0 truncate text-sm text-muted-foreground sm:w-28">
        {row.key}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            aria-label={`${row.key} value`}
            value={row.value}
            maxLength={FACT_VALUE_MAX}
            placeholder={row.hint}
            autoComplete="off"
            autoFocus
            className="h-10"
            onChange={(event) => onChange(editRowValue(row, event.target.value))}
            data-inline-edit=""
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onChange(before.current);
                finish(true);
              }
            }}
          />
        ) : (
          <button
            ref={valueButton}
            type="button"
            aria-label={`${row.key}: ${value || NOT_SET}`}
            className="-mx-2 block w-[calc(100%+1rem)] truncate rounded-md px-2 py-2 text-left text-base font-medium hover:bg-accent focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden motion-safe:transition-colors"
            onClick={() => {
              before.current = row;
              setEditing(true);
            }}
          >
            {value ? (
              row.value
            ) : (
              <span className="font-normal text-muted-foreground italic">{NOT_SET}</span>
            )}
          </button>
        )}
      </div>
      <Switch
        aria-label={row.key}
        checked={row.on}
        disabled={value === ""}
        onCheckedChange={() => onChange(toggleRow(row))}
      />
    </li>
  );
}
