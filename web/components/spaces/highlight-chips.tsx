import type { HighlightChipsProps } from "@/components/spaces/space-activity.types";
import { cn } from "@/lib/utils";

const CHIP =
  "glass inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs";

type Chip = Readonly<{ label: string; value: string }>;

const DEFAULT_LIMIT = 2;

function chipsFor({ highlights, latest }: HighlightChipsProps["space"], limit: number): Chip[] {
  if (highlights.length > 0) {
    return highlights
      .slice(0, limit)
      .map((highlight) => ({ label: highlight.key, value: highlight.value }));
  }
  return latest ? [{ label: "Latest", value: latest.title }] : [];
}

export function HighlightChips({ space, limit = DEFAULT_LIMIT, className }: HighlightChipsProps) {
  const chips = chipsFor(space, limit);
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Highlights">
      {chips.length === 0 ? (
        <li className={cn(CHIP, "border-dashed text-muted-foreground")}>Nothing shared yet</li>
      ) : (
        chips.map((chip) => (
          <li key={`${chip.label}:${chip.value}`} className={CHIP}>
            <span className="shrink-0 text-muted-foreground">{chip.label}</span>
            <span className="truncate font-medium text-foreground">{chip.value}</span>
          </li>
        ))
      )}
    </ul>
  );
}
