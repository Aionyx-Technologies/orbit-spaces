import type { OwnerBadgeProps } from "@/components/spaces/space-activity.types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function OwnerBadge({ space, className }: OwnerBadgeProps) {
  return (
    <Badge variant="glass" className={cn("max-w-full", className)}>
      <span className="truncate">
        {space.is_creator ? "Yours" : `Shared by ${space.owner_name ?? "someone"}`}
      </span>
    </Badge>
  );
}
