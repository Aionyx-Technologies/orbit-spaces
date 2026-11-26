import type { NewBadgeProps } from "@/components/spaces/new-badge.types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COUNT_CAP = 99;

export function NewBadge({ count, className }: NewBadgeProps) {
  if (count <= 0) {
    return null;
  }
  const shown = count > COUNT_CAP ? `${COUNT_CAP}+` : String(count);
  return (
    <Badge data-slot="new-badge" className={cn("shrink-0", className)}>
      <span aria-hidden="true">{shown} new</span>
      <span className="sr-only">{shown} new since you last looked</span>
    </Badge>
  );
}
