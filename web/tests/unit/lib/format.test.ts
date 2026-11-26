import { describe, expect, it } from "vitest";

import {
  deriveTitle,
  formatExpiresIn,
  formatFullDate,
  formatRelativeTime,
  initialsOf,
  isRecentlyActive,
  needsCollapse,
  plural,
} from "@/lib/format";

const NOW = Date.parse("2026-11-19T12:00:00Z");

function ago(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString();
}

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [44, "just now"],
    [45, "1 minute ago"],
    [89, "1 minute ago"],
    [120, "2 minutes ago"],
    [59 * 60, "59 minutes ago"],
    [60 * 60, "1 hour ago"],
    [2 * 3600 + 120, "2 hours ago"],
    [23 * 3600, "23 hours ago"],
    [24 * 3600, "yesterday"],
    [3 * 86400, "3 days ago"],
    [6 * 86400 + 3600, "6 days ago"],
  ])("renders %i seconds ago as %s", (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW)).toBe(expected);
  });

  it("uses a short date after a week in the same year", () => {
    expect(formatRelativeTime("2026-11-05T12:00:00Z", NOW)).toBe("Nov 5");
  });

  it("adds the year for dates in another year", () => {
    expect(formatRelativeTime("2025-03-02T12:00:00Z", NOW)).toBe("Mar 2, 2025");
  });

  it("never shows a future time", () => {
    expect(formatRelativeTime(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe("just now");
  });

  it("returns an empty string for an unreadable date", () => {
    expect(formatRelativeTime("not a date", NOW)).toBe("");
  });

  it("defaults to the current time", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("just now");
  });
});

describe("formatFullDate", () => {
  it("formats a date and time for tooltips", () => {
    const formatted = formatFullDate("2026-11-19T12:30:00Z");
    expect(formatted).toMatch(/Nov 19, 2026/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns an empty string for an unreadable date", () => {
    expect(formatFullDate("nope")).toBe("");
  });
});

describe("initialsOf", () => {
  it.each([
    ["Alex", "A"],
    ["alex smith", "AS"],
    ["Mary Jane Watson", "MW"],
    ["  Blake  ", "B"],
    ["", "?"],
    ["   ", "?"],
    [null, "?"],
    [undefined, "?"],
    ["Émile Zola", "ÉZ"],
  ])("turns %j into %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe("plural", () => {
  it("uses the singular for one", () => {
    expect(plural(1, "person", "people")).toBe("1 person");
  });

  it("uses the plural otherwise", () => {
    expect(plural(0, "person", "people")).toBe("0 people");
    expect(plural(3, "person", "people")).toBe("3 people");
  });

  it("adds an s by default", () => {
    expect(plural(2, "member")).toBe("2 members");
  });
});

describe("deriveTitle", () => {
  it("uses the first non-empty line", () => {
    expect(deriveTitle("\n\n  Hotel   shortlist \nSecond line")).toBe("Hotel shortlist");
  });

  it("falls back to Note for empty text", () => {
    expect(deriveTitle("   \n  ")).toBe("Note");
  });

  it("keeps a title that fits", () => {
    expect(deriveTitle("a".repeat(200))).toBe("a".repeat(200));
  });

  it("shortens a long title with an ellipsis within the limit", () => {
    const title = deriveTitle("word ".repeat(80));
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith("…")).toBe(true);
  });

  it("honours a custom limit", () => {
    expect(deriveTitle("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("needsCollapse", () => {
  it("collapses long text", () => {
    expect(needsCollapse("a".repeat(600), 520, 7)).toBe(true);
  });

  it("collapses text with many lines", () => {
    expect(needsCollapse("a\n".repeat(10), 520, 7)).toBe(true);
  });

  it("leaves short text alone", () => {
    expect(needsCollapse("short\ntext", 520, 7)).toBe(false);
  });
});

function inFuture(seconds: number): string {
  return new Date(NOW + seconds * 1000).toISOString();
}

describe("formatExpiresIn", () => {
  it.each([
    [-1, "expired"],
    [0, "expired"],
    [30 * 60, "expires within the hour"],
    [59 * 60, "expires within the hour"],
    [60 * 60, "expires in 1 hour"],
    [5 * 3600 + 120, "expires in 5 hours"],
    [24 * 3600, "expires in 1 day"],
    [3 * 86400 + 3600, "expires in 3 days"],
    [7 * 86400, "expires in 7 days"],
  ])("describes %i seconds from now as %s", (seconds, expected) => {
    expect(formatExpiresIn(inFuture(seconds), NOW)).toBe(expected);
  });

  it("says nothing about a date it cannot read", () => {
    expect(formatExpiresIn("soon", NOW)).toBe("");
  });
});

describe("isRecentlyActive", () => {
  it("is true for the last few minutes and false before and after that", () => {
    expect(isRecentlyActive(ago(0), NOW)).toBe(true);
    expect(isRecentlyActive(ago(4 * 60 + 59), NOW)).toBe(true);
    expect(isRecentlyActive(ago(5 * 60), NOW)).toBe(false);
    expect(isRecentlyActive(inFuture(60), NOW)).toBe(false);
  });

  it("accepts a custom window and ignores unreadable dates", () => {
    expect(isRecentlyActive(ago(50 * 60), NOW, 60)).toBe(true);
    expect(isRecentlyActive("never", NOW)).toBe(false);
  });
});
