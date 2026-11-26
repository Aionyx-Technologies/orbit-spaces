import { describe, expect, it } from "vitest";

import {
  countSpaces,
  emptyKindFor,
  filterInvitations,
  filterSpaces,
  normalizeText,
  parseTab,
  sortSpaces,
} from "@/lib/space-filters";
import {
  BLAKE,
  makeInvitation,
  makeQuietSpace,
  makeSpaceSummary,
} from "@/tests/unit/helpers/fixtures";

const goa = makeSpaceSummary({ id: "goa", name: "Goa trip" });
const cabin = makeSpaceSummary({
  id: "cabin",
  name: "Cabin weekend",
  is_creator: false,
  owner_name: "Zoe",
  members: [{ ...BLAKE, user_id: "dana", display_name: "Dana" }],
  highlights: [{ key: "Headcount", value: "6 people" }],
  latest: null,
  sources: ["Claude"],
  last_activity_at: "2026-11-18T10:00:00Z",
  created_at: "2026-11-10T09:00:00Z",
});
const quiet = makeQuietSpace({
  id: "quiet",
  name: "Café plans",
  created_at: "2026-11-15T09:00:00Z",
});

describe("parseTab", () => {
  it.each(["all", "yours", "shared", "pending"] as const)("accepts %s", (tab) => {
    expect(parseTab(tab)).toBe(tab);
  });

  it.each([undefined, null, "", "everything", "YOURS"])("falls back to all for %s", (value) => {
    expect(parseTab(value)).toBe("all");
  });
});

describe("normalizeText", () => {
  it("ignores case and accents", () => {
    expect(normalizeText("Café DÉJÀ")).toBe("cafe deja");
  });
});

describe("filterSpaces", () => {
  const spaces = [goa, cabin, quiet];

  it("keeps everything on All and nothing on Pending", () => {
    expect(filterSpaces(spaces, "all", "")).toHaveLength(3);
    expect(filterSpaces(spaces, "pending", "")).toEqual([]);
  });

  it("splits what you created from what was shared with you", () => {
    expect(filterSpaces(spaces, "yours", "").map((space) => space.id)).toEqual(["goa", "quiet"]);
    expect(filterSpaces(spaces, "shared", "").map((space) => space.id)).toEqual(["cabin"]);
  });

  it.each([
    ["the name", "goa", ["goa"]],
    ["the owner", "zoe", ["cabin"]],
    ["a member", "dana", ["cabin"]],
    ["a highlighted fact key", "headcount", ["cabin"]],
    ["a highlighted fact value", "6 people", ["cabin"]],
    ["the latest title", "hotel", ["goa"]],
    ["an assistant", "claude", ["cabin"]],
  ])("finds a space by %s", (_where, query, expected) => {
    expect(filterSpaces(spaces, "all", query).map((space) => space.id)).toEqual(expected);
  });

  it("needs every word to match, in any order", () => {
    expect(filterSpaces(spaces, "all", "trip goa")).toHaveLength(1);
    expect(filterSpaces(spaces, "all", "goa cabin")).toEqual([]);
  });

  it("ignores accents and case in both the query and the data", () => {
    expect(filterSpaces(spaces, "all", "CAFE")).toHaveLength(1);
    expect(filterSpaces(spaces, "all", "café")).toHaveLength(1);
  });

  it("treats a blank query as no filter and combines the query with the tab", () => {
    expect(filterSpaces(spaces, "all", "   ")).toHaveLength(3);
    expect(filterSpaces(spaces, "shared", "goa")).toEqual([]);
  });
});

describe("filterInvitations", () => {
  const invitations = [
    makeInvitation(),
    makeInvitation({ id: "i2", space_name: "Book club", invited_by: "Blake" }),
    makeInvitation({ id: "i3", space_name: "Ski trip", invited_by: null }),
  ];

  it("finds invitations by space name or by who sent them", () => {
    expect(filterInvitations(invitations, "lisbon").map((i) => i.id)).toEqual(["invitation-1"]);
    expect(filterInvitations(invitations, "blake").map((i) => i.id)).toEqual(["i2"]);
    expect(filterInvitations(invitations, "")).toHaveLength(3);
    expect(filterInvitations(invitations, "nothing")).toEqual([]);
  });
});

describe("sortSpaces", () => {
  const spaces = [goa, cabin, quiet];

  it("puts the most recent activity first", () => {
    expect(sortSpaces(spaces, "activity").map((space) => space.id)).toEqual([
      "goa",
      "cabin",
      "quiet",
    ]);
  });

  it("orders by name the way people read numbers", () => {
    const trips = ["Trip 10", "trip 2", "Trip 1"].map((name, index) =>
      makeSpaceSummary({ id: `t${index}`, name }),
    );
    expect(sortSpaces(trips, "name").map((space) => space.name)).toEqual([
      "Trip 1",
      "trip 2",
      "Trip 10",
    ]);
  });

  it("orders by creation date, newest first", () => {
    expect(sortSpaces(spaces, "created").map((space) => space.id)).toEqual([
      "quiet",
      "cabin",
      "goa",
    ]);
  });

  it("breaks ties by name and never changes the list it was given", () => {
    const same = [
      makeSpaceSummary({ id: "b", name: "Beta" }),
      makeSpaceSummary({ id: "a", name: "Alpha" }),
    ];
    const snapshot = [...same];

    expect(sortSpaces(same, "activity").map((space) => space.name)).toEqual(["Alpha", "Beta"]);
    expect(same).toEqual(snapshot);
  });
});

describe("countSpaces", () => {
  it("counts each tab", () => {
    expect(countSpaces([goa, cabin, quiet], [makeInvitation()])).toEqual({
      all: 3,
      yours: 2,
      shared: 1,
      pending: 1,
    });
  });
});

describe("emptyKindFor", () => {
  it.each([
    [true, false, "all", "none"],
    [true, true, "pending", "none"],
    [false, true, "yours", "search"],
    [false, false, "all", "yours"],
    [false, false, "yours", "yours"],
    [false, false, "shared", "shared"],
    [false, false, "pending", "pending"],
  ] as const)("blank=%s searching=%s tab=%s -> %s", (blank, searching, tab, expected) => {
    expect(emptyKindFor(blank, searching, tab)).toBe(expected);
  });
});
