import { describe, expect, it } from "vitest";

import {
  CHIP_PLACEHOLDERS,
  editRowValue,
  factsToSend,
  rowsFromTemplate,
  syncRowsWithTemplate,
  toggleRow,
} from "@/lib/space-setup";
import type { FactRow } from "@/lib/space-setup.types";
import { toFormValue } from "@/lib/template-form";
import { FAMILY_VACATION } from "@/tests/unit/helpers/fixtures";

function row(overrides: Partial<FactRow> = {}): FactRow {
  return { key: "Dates", hint: "When", value: "", on: false, suggested: false, ...overrides };
}

describe("rowsFromTemplate", () => {
  it("gives one empty, switched-off row per template fact, in template order", () => {
    expect(rowsFromTemplate(FAMILY_VACATION)).toEqual([
      { key: "Dates", hint: "When you are travelling", value: "", on: false, suggested: false },
      { key: "Budget", hint: "Total for the trip", value: "", on: false, suggested: false },
      { key: "Destination", hint: "Where you are going", value: "", on: false, suggested: false },
    ]);
  });

  it("fills matching suggested facts, ignoring case, and switches them on", () => {
    const rows = rowsFromTemplate(FAMILY_VACATION, [
      { key: "destination", value: "Goa" },
      { key: "Dates", value: "Dec 20–27" },
      { key: "Unknown", value: "ignored" },
    ]);

    expect(rows.map(({ key, value, on, suggested }) => ({ key, value, on, suggested }))).toEqual([
      { key: "Dates", value: "Dec 20–27", on: true, suggested: true },
      { key: "Budget", value: "", on: false, suggested: false },
      { key: "Destination", value: "Goa", on: true, suggested: true },
    ]);
  });

  it("treats a blank suggested value as not set", () => {
    const [dates] = rowsFromTemplate(FAMILY_VACATION, [{ key: "Dates", value: "  " }]);

    expect(dates).toMatchObject({ value: "", on: false, suggested: false });
  });
});

describe("editRowValue", () => {
  it("marks an edited suggested value as not suggested", () => {
    const edited = editRowValue(
      row({ value: "Dec 20–27", on: true, suggested: true }),
      "Dec 21–27",
    );

    expect(edited).toEqual(row({ value: "Dec 21–27", on: true, suggested: false }));
  });

  it("switches an empty row on when a value is typed", () => {
    expect(editRowValue(row(), "D")).toMatchObject({ value: "D", on: true });
  });

  it("does not switch an empty row on for whitespace", () => {
    expect(editRowValue(row(), " ")).toMatchObject({ value: " ", on: false });
  });

  it("switches a row off when its value is cleared", () => {
    expect(editRowValue(row({ value: "Dec", on: true }), "")).toMatchObject({
      value: "",
      on: false,
    });
  });

  it("leaves a row the person switched off alone while they edit it", () => {
    expect(editRowValue(row({ value: "Dec", on: false }), "Dec 2")).toMatchObject({ on: false });
  });
});

describe("toggleRow", () => {
  it("flips a row that has a value", () => {
    expect(toggleRow(row({ value: "Dec", on: true })).on).toBe(false);
    expect(toggleRow(row({ value: "Dec", on: false })).on).toBe(true);
  });

  it("does nothing to an empty row", () => {
    const empty = row();

    expect(toggleRow(empty)).toBe(empty);
    expect(toggleRow(row({ value: "  " })).on).toBe(false);
  });
});

describe("factsToSend", () => {
  it("sends only rows that are on and have a value, trimmed", () => {
    expect(
      factsToSend([
        row({ key: "Dates", value: " Dec 20–27 ", on: true, suggested: true }),
        row({ key: "Budget", value: "₹15k", on: false, suggested: true }),
        row({ key: "Stay", value: "", on: true }),
        row({ key: "Headcount", value: "6", on: true, suggested: false }),
      ]),
    ).toEqual([
      { key: "Dates", value: "Dec 20–27", suggested: true },
      { key: "Headcount", value: "6", suggested: false },
    ]);
  });

  it("sends nothing when no row is on", () => {
    expect(factsToSend([row({ value: "x" })])).toEqual([]);
  });
});

describe("syncRowsWithTemplate", () => {
  it("keeps rows whose keys remain, adds new keys empty, and drops removed keys", () => {
    const rows = rowsFromTemplate(FAMILY_VACATION, [{ key: "Dates", value: "Dec 20–27" }]);
    const form = toFormValue(FAMILY_VACATION);
    form.facts = [
      { key: "Guests", hint: "How many" },
      { key: "Dates", hint: "When you are travelling" },
      { key: "  ", hint: "" },
    ];

    expect(syncRowsWithTemplate(rows, form)).toEqual([
      { key: "Guests", hint: "How many", value: "", on: false, suggested: false },
      {
        key: "Dates",
        hint: "When you are travelling",
        value: "Dec 20–27",
        on: true,
        suggested: true,
      },
    ]);
  });

  it("shows a repeated key once", () => {
    const form = toFormValue(FAMILY_VACATION);
    form.facts = [
      { key: "Dates", hint: "" },
      { key: "dates", hint: "" },
    ];

    expect(syncRowsWithTemplate([], form).map((fact) => fact.key)).toEqual(["Dates"]);
  });
});

describe("CHIP_PLACEHOLDERS", () => {
  it("has an example name for every built-in template", () => {
    expect(CHIP_PLACEHOLDERS).toEqual({
      trip: "Hawaii trip",
      "holiday-gifts": "Family Christmas",
      household: "Flat 4B",
      "dinner-party": "Friendsgiving",
      event: "Sam's 30th",
      "freelancer-client": "Website redesign",
      "team-project": "Q1 launch",
      general: "Book club",
    });
  });
});
