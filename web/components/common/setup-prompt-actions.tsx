"use client";

import { ArrowRightIcon } from "lucide-react";

import { CopyButton } from "@/components/common/copy-button";
import type { SetupPromptActionsProps } from "@/components/common/setup-prompt-actions.types";
import { setupPrompt } from "@/lib/setup-prompt";
import { cn } from "@/lib/utils";

/*
 * One button that copies a prompt the person pastes into their own assistant,
 * which then connects Orbit for them, plus a link to the step-by-step guides
 * for anyone who would rather click through it themselves.
 */
export function SetupPromptActions({ mcpUrl, guideHref, className }: SetupPromptActionsProps) {
  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <CopyButton
        value={setupPrompt(mcpUrl)}
        label="Copy setup prompt"
        copiedLabel="Copied. Paste it into your assistant"
        variant="default"
        size="lg"
        className="w-full sm:w-auto"
      />
      {guideHref ? (
        <a
          href={guideHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          Setup guide
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
