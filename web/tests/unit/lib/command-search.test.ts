import { describe, expect, it } from "vitest";

import {
  buildCommands,
  flattenSections,
  IDLE_SPACE_LIMIT,
  searchCommands,
} from "@/lib/command-search";
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
  owner_name: "Blake",
  members: [BLAKE],
  highlights: [{ key: "Dates", value: "Jan 10 to 12" }],
  last_activity_at: "2026-11-18T10:00:00Z",
});
const commands = buildCommands([cabin, goa], [makeInvitation()]);

function labels(query: string): string[] {
  return flattenSections(searchCommands(commands, query)).map((item) => item.label);
}

describe("buildCommands", () => {
  it("lists invitations first, then spaces by recent activity, then actions", () => {
    expect(commands.map((item) => item.group)).toEqual([
      "Pending",
      "Spaces",
      "Spaces",
      ...Array(7).fill("Actions"),
    ]);
    expect(commands.filter((item) => item.group === "Spaces").map((item) => item.label)).toEqual([
      "Goa trip",
      "Cabin weekend",
    ]);
  });

  it("sends each command to the right place", () => {
    const byId = new Map(commands.map((item) => [item.id, item.action]));

    expect(byId.get("space:goa")).toEqual({ type: "navigate", href: "/spaces/goa" });
    expect(byId.get("invitation:invitation-1")).toEqual({
      type: "navigate",
      href: "/spaces?tab=pending",
    });
    expect(byId.get("action:new-space")).toEqual({ type: "navigate", href: "/spaces?new=1" });
    expect(byId.get("action:theme-dark")).toEqual({ type: "theme", choice: "dark" });
    expect(byId.get("action:assistants")).toEqual({ type: "navigate", href: "/assistants" });
    expect(byId.get("action:settings")).toEqual({ type: "navigate", href: "/settings" });
  });

  it("says whose space it is and who sent an invitation", () => {
    const descriptions = new Map(commands.map((item) => [item.id, item.description]));

    expect(descriptions.get("space:goa")).toBe("Yours");
    expect(descriptions.get("space:cabin")).toBe("Shared by Blake");
    expect(descriptions.get("invitation:invitation-1")).toBe("From Alex");
  });

  it("copes with an invitation from someone whose account is gone", () => {
    const [item] = buildCommands([], [makeInvitation({ invited_by: null })]);
    expect(item?.description).toBeUndefined();
  });
});

describe("searchCommands", () => {
  it("shows a few recent spaces and every action when nothing is typed", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      makeQuietSpace({ id: `s${index}`, name: `Space ${index}` }),
    );
    const sections = searchCommands(buildCommands(many, []), "");

    expect(sections.map((section) => section.group)).toEqual(["Spaces", "Actions"]);
    expect(sections[0]?.items).toHaveLength(IDLE_SPACE_LIMIT);
    expect(sections[1]?.items).toHaveLength(7);
  });

  it("finds things by name, ignoring case and accents", () => {
    expect(labels("GOA")).toEqual(["Goa trip"]);
    expect(labels("cabín")).toEqual(["Cabin weekend"]);
  });

  it("finds a space by something inside it", () => {
    expect(labels("jan")).toEqual(["Cabin weekend"]);
    expect(labels("blake")).toContain("Cabin weekend");
  });

  it("ranks a name that starts with the query above a word match, a substring and a keyword", () => {
    const named = (name: string, sources: string[] = []) =>
      makeQuietSpace({ id: name, name, sources, members: [] });
    const items = buildCommands(
      [named("Other", ["trips"]), named("Entriprise"), named("Goa trip"), named("Trip planner")],
      [],
    );

    const ranked = flattenSections(searchCommands(items, "trip")).map((item) => item.label);

    expect(ranked).toEqual(["Trip planner", "Goa trip", "Entriprise", "Other"]);
  });

  it("keeps the original order between equally good matches", () => {
    const items = buildCommands(
      [
        makeQuietSpace({
          id: "a",
          name: "Trip A",
          members: [],
          last_activity_at: "2026-11-02T00:00:00Z",
        }),
        makeQuietSpace({
          id: "b",
          name: "Trip B",
          members: [],
          last_activity_at: "2026-11-03T00:00:00Z",
        }),
      ],
      [],
    );

    expect(flattenSections(searchCommands(items, "trip")).map((item) => item.label)).toEqual([
      "Trip B",
      "Trip A",
    ]);
  });

  it("finds actions by what people would call them", () => {
    expect(labels("night")).toEqual(["Switch to dark theme"]);
    expect(labels("create")).toEqual(["New space"]);
    expect(labels("assistant")).toEqual(["Open assistants"]);
    expect(labels("connect")).toEqual(["Open assistants"]);
    expect(labels("profile")).toEqual(["Open settings"]);
  });

  it("needs every word to match", () => {
    expect(labels("dark theme")).toEqual(["Switch to dark theme"]);
    expect(labels("dark goa")).toEqual([]);
  });

  it("keeps groups in a fixed order and drops empty ones", () => {
    const sections = searchCommands(commands, "o");

    expect(sections.map((section) => section.group)).toEqual(["Pending", "Spaces", "Actions"]);
    expect(searchCommands(commands, "zzzz")).toEqual([]);
  });

  it("finds an invitation by its space name", () => {
    expect(labels("lisbon")).toEqual(["Review invitation to Weekend in Lisbon"]);
  });
});
