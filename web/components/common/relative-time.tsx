"use client";

import type { RelativeTimeProps } from "@/components/common/relative-time.types";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const now = useNow();
  return (
    <time
      dateTime={date}
      title={formatFullDate(date)}
      className={className}
      suppressHydrationWarning
    >
      {formatRelativeTime(date, now)}
    </time>
  );
}
