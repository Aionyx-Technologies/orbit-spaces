import { describe, expect, it } from "vitest";

import { describeLastSignIn } from "@/lib/last-sign-in";

describe("describeLastSignIn", () => {
  it("gives the day and the browser, and nothing else", () => {
    const line = describeLastSignIn({ at: "2026-11-19T10:30:00Z", browser: "Chrome" }, "UTC");

    expect(line).toBe("Last sign-in: 19 Nov 2026, Chrome");
  });

  it("shows the day in the person's own time zone", () => {
    const late = { at: "2026-11-19T22:30:00Z", browser: "Safari" };

    expect(describeLastSignIn(late, "UTC")).toBe("Last sign-in: 19 Nov 2026, Safari");
    expect(describeLastSignIn(late, "Asia/Kolkata")).toBe("Last sign-in: 20 Nov 2026, Safari");
  });

  it("falls back to UTC for a zone the browser does not know", () => {
    const line = describeLastSignIn(
      { at: "2026-11-19T10:30:00Z", browser: "Firefox" },
      "Nowhere/Land",
    );

    expect(line).toBe("Last sign-in: 19 Nov 2026, Firefox");
  });

  it("leaves the browser out when it is not known", () => {
    expect(describeLastSignIn({ at: "2026-11-19T10:30:00Z", browser: "  " }, "UTC")).toBe(
      "Last sign-in: 19 Nov 2026",
    );
  });

  it("says nothing when the date cannot be read", () => {
    expect(describeLastSignIn({ at: "soon", browser: "Chrome" }, "UTC")).toBeNull();
  });
});
