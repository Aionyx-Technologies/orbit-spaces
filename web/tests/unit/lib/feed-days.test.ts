import { describe, expect, it } from "vitest";

import { dayLabel, groupByDay } from "@/lib/feed-days";

const NOW = Date.parse("2026-11-21T15:00:00Z");

describe("groupByDay", () => {
  it("keeps newest-first order and splits on calendar days in the person's time zone", () => {
    const items = [
      { id: "a", created_at: "2026-11-21T14:00:00Z" },
      { id: "b", created_at: "2026-11-21T01:00:00Z" },
      { id: "c", created_at: "2026-11-20T09:00:00Z" },
      { id: "d", created_at: "2026-11-12T09:00:00Z" },
    ];

    const days = groupByDay(items, "UTC", NOW);

    expect(days.map((day) => [day.label, day.items.map((item) => item.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Thu 12 Nov", ["d"]],
    ]);
  });

  it("uses the person's time zone, not the server's", () => {
    // 01:00 UTC on the 21st is still the evening of the 20th in New York.
    const days = groupByDay([{ created_at: "2026-11-21T01:00:00Z" }], "America/New_York", NOW);

    expect(days[0]?.label).toBe("Yesterday");
  });

  it("falls back to UTC for a time zone it does not know", () => {
    expect(groupByDay([{ created_at: "2026-11-21T01:00:00Z" }], "Mars/Base", NOW)[0]?.label).toBe(
      "Today",
    );
  });
});

describe("dayLabel", () => {
  it("adds the year for a day in another year", () => {
    expect(dayLabel(new Date("2025-12-30T12:00:00Z"), NOW, "UTC")).toBe("Tue 30 Dec 2025");
  });
});
