import { RelativeTime } from "@/components/common/relative-time";
import type { SpaceActivityProps } from "@/components/spaces/space-activity.types";
import { describeLatest } from "@/lib/space-activity";
import { cn } from "@/lib/utils";

export function SpaceActivity({ space, className }: SpaceActivityProps) {
  const latest = space.latest;
  if (!latest) {
    return (
      <p className={cn("truncate text-sm text-muted-foreground", className)}>
        {space.fact_count > 0 ? "No notes yet" : "Nothing shared yet"}{" "}
        <span aria-hidden="true">·</span> created <RelativeTime date={space.created_at} />
      </p>
    );
  }
  const { subject, verb } = describeLatest(latest);
  return (
    <p className={cn("truncate text-sm text-muted-foreground", className)}>
      <span className="font-medium text-foreground">{subject}</span> {verb} “{latest.title}”{" "}
      <span aria-hidden="true">·</span> <RelativeTime date={latest.created_at} />
    </p>
  );
}
