import { AssistantMark } from "@/components/brand/assistant-mark";
import type { SourceBadgesProps } from "@/components/spaces/source-badges.types";
import { sourceLabel } from "@/lib/assistants";
import { cn } from "@/lib/utils";

export function SourceBadges({ sources, max = 3, className }: SourceBadgesProps) {
  if (sources.length === 0) {
    return null;
  }
  const shown = sources.slice(0, max);
  const hidden = sources.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="sr-only">{`Used with ${sources.map(sourceLabel).join(", ")}`}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1.5">
        {shown.map((name) => (
          <AssistantMark key={name} name={name} title={sourceLabel(name)} className="size-5" />
        ))}
        {hidden > 0 ? <span className="text-xs text-muted-foreground">+{hidden}</span> : null}
      </span>
    </span>
  );
}
