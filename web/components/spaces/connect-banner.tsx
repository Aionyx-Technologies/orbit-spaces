import Link from "next/link";

import { AssistantMark } from "@/components/brand/assistant-mark";

const ASSISTANTS = [
  "ChatGPT",
  "Claude",
  "Grok",
  "Muse",
  "OpenClaw",
  "Hermes Agent",
  "Wabi",
] as const;

export function ConnectBanner() {
  return (
    <aside
      aria-label="Connect an assistant"
      className="flex flex-wrap items-center gap-4 rounded-lg border bg-card/60 p-4 sm:p-5"
    >
      <span aria-hidden="true" className="flex -space-x-2">
        {ASSISTANTS.map((name) => (
          <AssistantMark key={name} name={name} className="size-8 ring-2 ring-card" />
        ))}
      </span>
      <p className="min-w-0 flex-1 text-sm text-pretty text-muted-foreground">
        Using ChatGPT, Claude, Grok or another assistant?{" "}
        <Link href="/assistants" className="text-primary underline underline-offset-4">
          Connect it on the Assistants tab
        </Link>{" "}
        so it can share here.
      </p>
    </aside>
  );
}
