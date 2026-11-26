"use client";

import { ArrowRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantMark } from "@/components/brand/assistant-mark";
import { LogoMark } from "@/components/brand/logo";
import { CopyButton } from "@/components/common/copy-button";
import type { HeroSetupPromptProps } from "@/components/landing/hero-setup-prompt.types";
import { setupPrompt } from "@/lib/setup-prompt";

const TURN_MS = 2_200;

/*
 * The hero's way in: a chat box holding the start of the setup prompt, with
 * the copy button where "send" would be. The visitor copies it, pastes it into
 * their own assistant, and the assistant connects Orbit and walks them through
 * sign-in. The caption cycles through the assistants it works in.
 */
export function HeroSetupPrompt({ mcpUrl, assistants }: HeroSetupPromptProps) {
  const prompt = setupPrompt(mcpUrl);
  // Only the first sentence, so the box never cuts a sentence off mid-word.
  const preview = `${prompt.split(". ")[0]}.`;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-2 rounded-[1.375rem] border bg-card/85 p-2 text-left shadow-lift backdrop-blur-sm sm:flex-row sm:items-center sm:pl-4">
        <p className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 sm:px-0" aria-hidden="true">
          <LogoMark className="size-5 shrink-0" />
          <span className="truncate text-[0.9375rem] text-foreground/80">
            &ldquo;{preview}&rdquo;
          </span>
        </p>
        <CopyButton
          value={prompt}
          label="Copy setup prompt"
          copiedLabel="Copied. Now paste it"
          variant="default"
          size="lg"
          className="w-full rounded-2xl sm:w-auto"
        />
      </div>
      <p className="text-sm text-balance text-muted-foreground">
        Paste it into <AssistantTicker names={assistants} />
        <span className="sr-only">your assistant</span> and it sets up Orbit for you.{" "}
        <a
          href="/setup"
          className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
        >
          Setup guide
          <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </a>
      </p>
    </div>
  );
}

function AssistantTicker({ names }: Readonly<{ names: readonly string[] }>) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (names.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % names.length), TURN_MS);
    return () => clearInterval(timer);
  }, [names.length]);

  const name = names[index] ?? "";

  return (
    <span aria-hidden="true" className="inline-flex align-bottom font-medium text-foreground">
      <span key={name} className="ticker-in inline-flex items-center gap-1.5">
        <AssistantMark name={name} className="size-4" />
        {name}
      </span>
    </span>
  );
}
