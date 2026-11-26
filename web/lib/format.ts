import { TITLE_MAX } from "@/lib/constants";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const JUST_NOW_SECONDS = 45;
const DATE_AFTER_DAYS = 7;
const ACTIVE_WITHIN_MINUTES = 5;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatShortDate(timestamp: number, now: number): string {
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(timestamp);
}

// A calendar day as the server stored it, always in UTC so it reads the same for everyone.
export function formatDay(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRelativeTime(isoDate: string, now: number = Date.now()): string {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < JUST_NOW_SECONDS) {
    return "just now";
  }
  if (seconds < HOUR) {
    return relative.format(-Math.max(1, Math.floor(seconds / MINUTE)), "minute");
  }
  if (seconds < DAY) {
    return relative.format(-Math.floor(seconds / HOUR), "hour");
  }
  const days = Math.floor(seconds / DAY);
  if (days < DATE_AFTER_DAYS) {
    return relative.format(-days, "day");
  }
  return formatShortDate(then, now);
}

export function formatExpiresIn(isoDate: string, now: number = Date.now()): string {
  const expires = Date.parse(isoDate);
  if (Number.isNaN(expires)) {
    return "";
  }
  const seconds = Math.floor((expires - now) / 1000);
  if (seconds <= 0) {
    return "expired";
  }
  if (seconds < HOUR) {
    return "expires within the hour";
  }
  if (seconds < DAY) {
    return `expires in ${plural(Math.floor(seconds / HOUR), "hour")}`;
  }
  return `expires in ${plural(Math.floor(seconds / DAY), "day")}`;
}

export function isRecentlyActive(
  isoDate: string,
  now: number = Date.now(),
  withinMinutes: number = ACTIVE_WITHIN_MINUTES,
): boolean {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) {
    return false;
  }
  const elapsed = now - then;
  return elapsed >= 0 && elapsed < withinMinutes * MINUTE * 1000;
}

export function formatFullDate(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    timestamp,
  );
}

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) {
    return "?";
  }
  const firstLetter = [...first][0] ?? "?";
  const last = words[words.length - 1] ?? first;
  if (words.length === 1) {
    return firstLetter.toUpperCase();
  }
  return `${firstLetter}${[...last][0] ?? ""}`.toUpperCase();
}

export function plural(count: number, one: string, many: string = `${one}s`): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

export function deriveTitle(content: string, maxLength: number = TITLE_MAX): string {
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return "Note";
  }
  if (firstLine.length <= maxLength) {
    return firstLine;
  }
  return `${firstLine.slice(0, maxLength - 1).trimEnd()}…`;
}

export function needsCollapse(content: string, characters: number, lines: number): boolean {
  return content.length > characters || content.split("\n").length > lines;
}
