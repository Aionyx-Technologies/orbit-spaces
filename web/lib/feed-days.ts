import type { FeedDay } from "@/lib/feed-days.types";

const DAY_MS = 86_400_000;

function dayKey(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and compares as plain text.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function dayLabel(date: Date, now: number, timeZone: string): string {
  const zone = safeZone(timeZone);
  const key = dayKey(date, zone);
  if (key === dayKey(new Date(now), zone)) {
    return "Today";
  }
  if (key === dayKey(new Date(now - DAY_MS), zone)) {
    return "Yesterday";
  }
  const sameYear = key.slice(0, 4) === dayKey(new Date(now), zone).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(date)
    .replace(",", "");
}

/*
 * Splits a newest-first list into runs that share a calendar day in the
 * person's own time zone, keeping the original order inside each run.
 */
export function groupByDay<T extends { created_at: string }>(
  items: readonly T[],
  timeZone: string,
  now: number,
): FeedDay<T>[] {
  const zone = safeZone(timeZone);
  const days: FeedDay<T>[] = [];
  for (const item of items) {
    const date = new Date(item.created_at);
    const key = dayKey(date, zone);
    const last = days.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      days.push({ key, label: dayLabel(date, now, zone), items: [item] });
    }
  }
  return days;
}
