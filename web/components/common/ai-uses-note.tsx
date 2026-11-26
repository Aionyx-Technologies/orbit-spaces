import Link from "next/link";

import type { AiUsesNoteProps } from "@/components/common/ai-uses-note.types";
import { cn } from "@/lib/utils";

function resetDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AiUsesNote({ uses, billingEnabled, className }: AiUsesNoteProps) {
  if (uses.limit === null || uses.remaining === null) {
    return null;
  }
  const resets = `No AI uses left this month. They reset on ${resetDate(uses.resets_at)}.`;
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {uses.remaining !== 0 ? (
        `${uses.remaining} of ${uses.limit} AI uses left this month`
      ) : billingEnabled ? (
        <>
          {resets} Buy more or upgrade in{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Settings
          </Link>
          .
        </>
      ) : (
        `${resets} Plans with more AI uses are coming soon.`
      )}
    </p>
  );
}
