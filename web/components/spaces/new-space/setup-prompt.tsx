"use client";

import { Loader2Icon, WandSparklesIcon } from "lucide-react";

import type { SetupPromptProps } from "@/components/spaces/new-space/setup-prompt.types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_PURPOSE_MAX } from "@/lib/constants";

const PLACEHOLDER = "Vegas weekend with college friends, Dec 19–21, 6 of us, about $3,000 each";

export function SetupPrompt({
  label,
  value,
  onChange,
  onSubmit,
  working,
  notice,
  quiet,
}: SetupPromptProps) {
  return (
    <div className="grid gap-3">
      <Textarea
        aria-label={label}
        value={value}
        rows={2}
        maxLength={TEMPLATE_PURPOSE_MAX}
        placeholder={PLACEHOLDER}
        autoFocus
        className="field-sizing-content max-h-[calc(4lh+1.5rem+2px)] min-h-[calc(2lh+1.5rem+2px)] resize-none rounded-lg"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex flex-wrap items-start justify-end gap-x-4 gap-y-2">
        <p
          role="status"
          className="mr-auto min-w-0 flex-1 basis-56 pt-2.5 text-sm text-muted-foreground empty:pt-0"
        >
          {notice}
        </p>
        <Button
          type="button"
          variant={quiet ? "outline" : "default"}
          disabled={value.trim() === ""}
          onClick={onSubmit}
        >
          {working ? (
            <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
          ) : (
            <WandSparklesIcon aria-hidden="true" />
          )}
          {working ? "Setting up…" : "Set it up"}
        </Button>
      </div>
    </div>
  );
}
