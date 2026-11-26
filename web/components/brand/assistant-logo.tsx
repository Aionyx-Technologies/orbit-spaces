import { AssistantGlyph } from "@/components/brand/assistant-glyph";
import type { AssistantLogoProps } from "@/components/brand/assistant-logo.types";
import { cn } from "@/lib/utils";

export function AssistantLogo({ assistant, title, className }: AssistantLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-slot="assistant-mark"
      data-assistant={assistant}
      className={cn(
        "size-5 shrink-0 text-foreground",
        assistant === "claude" ? "rounded-[22%]" : "rounded-full",
        className,
      )}
    >
      {title ? <title>{title}</title> : null}
      <AssistantGlyph assistant={assistant} />
    </svg>
  );
}
