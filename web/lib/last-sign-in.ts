import type { LastSignIn } from "@/lib/api.types";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";

function formatDay(timestamp: number, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: DEFAULT_TIME_ZONE }).format(
      timestamp,
    );
  }
}

export function describeLastSignIn(last: LastSignIn, timeZone: string): string | null {
  const timestamp = Date.parse(last.at);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const day = formatDay(timestamp, timeZone);
  const browser = last.browser.trim();
  return browser === "" ? `Last sign-in: ${day}` : `Last sign-in: ${day}, ${browser}`;
}
