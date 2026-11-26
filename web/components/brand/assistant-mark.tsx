import { AssistantLogo } from "@/components/brand/assistant-logo";
import type { AssistantMarkProps } from "@/components/brand/assistant-logo.types";
import { assistantKey, sourceTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

export function AssistantMark({ name, title, className }: AssistantMarkProps) {
  const assistant = assistantKey(name);
  if (assistant) {
    return <AssistantLogo assistant={assistant} title={title} className={className} />;
  }
  return (
    <span
      aria-hidden="true"
      title={title}
      data-slot="assistant-mark"
      data-assistant="other"
      className={cn("source inline-block size-5 shrink-0 rounded-full", className)}
      style={cssVars(toneVars(sourceTone(name)))}
    />
  );
}
