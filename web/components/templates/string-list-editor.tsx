"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";

import type { StringListEditorProps } from "@/components/templates/string-list-editor.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { preventEnterSubmit } from "@/lib/template-form";

function moved(values: string[], from: number, to: number): string[] {
  const next = [...values];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked ?? "");
  return next;
}

export function StringListEditor({
  legend,
  itemLabel,
  addLabel,
  values,
  onChange,
  max,
  maxLength,
  movable = false,
  placeholder,
  trailing,
}: StringListEditorProps) {
  const noun = itemLabel.toLowerCase();

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <ul className="grid gap-2">
        {values.map((value, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <Input
              aria-label={`${itemLabel} ${index + 1}`}
              value={value}
              maxLength={maxLength}
              placeholder={placeholder}
              autoComplete="off"
              onKeyDown={preventEnterSubmit}
              onChange={(event) =>
                onChange(values.map((current, at) => (at === index ? event.target.value : current)))
              }
            />
            {movable ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${noun} ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => onChange(moved(values, index, index - 1))}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${noun} ${index + 1} down`}
                  disabled={index === values.length - 1}
                  onClick={() => onChange(moved(values, index, index + 1))}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${noun} ${index + 1}`}
              className="text-muted-foreground"
              onClick={() => onChange(values.filter((_, at) => at !== index))}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
        {trailing}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        disabled={values.length >= max}
        onClick={() => onChange([...values, ""])}
      >
        <PlusIcon aria-hidden="true" />
        {addLabel}
      </Button>
    </fieldset>
  );
}
