import { describe, expect, it } from "vitest";

import type { SpaceSummaryWire } from "@/lib/api.types";
import { NO_INVITATIONS, withoutInvitation } from "@/lib/invitations";
import { contentWidth, headerWidth } from "@/lib/shell";
import { describeLatest } from "@/lib/space-activity";
import { layoutClass } from "@/lib/space-layout";
import { withPreview } from "@/lib/spaces";
import { makeInvitation, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";

const PREVIEW_FIELDS = [
  "owner_name",
  "last_activity_at",
  "note_count",
  "fact_count",
  "has_plan",
  "highlights",
  "latest",
  "sources",
  "new_count",
];

function whatAnOlderServerSends(): SpaceSummaryWire {
  return Object.fromEntries(
    Object.entries(makeSpaceSummary()).filter(([key]) => !PREVIEW_FIELDS.includes(key)),
  ) as SpaceSummaryWire;
}

describe("withPreview", () => {
  it("fills in what an older server does not send", () => {
    const older = whatAnOlderServerSends();

    expect(withPreview(older)).toEqual({
      ...older,
      owner_name: null,
      last_activity_at: older.created_at,
      note_count: 0,
      fact_count: 0,
      has_plan: false,
      highlights: [],
      latest: null,
      sources: [],
      new_count: 0,
    });
  });

  it("keeps what the server did send", () => {
    const space = makeSpaceSummary();
    expect(withPreview(space)).toEqual(space);
  });
});

describe("withoutInvitation", () => {
  it("removes just the invitation that was handled", () => {
    const current = {
      invitations: [makeInvitation({ id: "a" }), makeInvitation({ id: "b" })],
    };

    expect(withoutInvitation(current, "a").invitations.map((i) => i.id)).toEqual(["b"]);
    expect(current.invitations).toHaveLength(2);
  });

  it("copes with nothing loaded yet", () => {
    expect(withoutInvitation(undefined, "a")).toEqual(NO_INVITATIONS);
  });
});

describe("describeLatest", () => {
  const base = makeSpaceSummary().latest!;

  it("credits the assistant when one was used", () => {
    expect(describeLatest(base)).toEqual({ subject: "Grok", verb: "added" });
  });

  it("credits the person for something written on the web", () => {
    expect(describeLatest({ ...base, via: "web", shared_by_name: "Alex" })).toEqual({
      subject: "Alex",
      verb: "added",
    });
    expect(describeLatest({ ...base, via: " ", shared_by_name: null })).toEqual({
      subject: "Someone",
      verb: "added",
    });
  });

  it("credits Orbit for plans it wrote", () => {
    expect(describeLatest({ ...base, kind: "plan", author_kind: "orbit", via: "ChatGPT" })).toEqual(
      {
        subject: "Orbit",
        verb: "wrote",
      },
    );
  });
});

describe("layout helpers", () => {
  it("uses one column for the list and a responsive grid for the gallery", () => {
    expect(layoutClass("list")).toBe("grid grid-cols-1 gap-3");
    expect(layoutClass("grid")).toContain("lg:grid-cols-3");
  });

  it("gives each page width a content size, under one header width that never changes", () => {
    expect(contentWidth("narrow")).toBe("max-w-2xl");
    expect(contentWidth("wide")).toBe("max-w-5xl");
    expect(contentWidth("gallery")).toBe("max-w-6xl");
    expect(headerWidth()).toBe("max-w-6xl");
  });
});
