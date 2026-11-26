import { describe, expect, it } from "vitest";

import { parsePlan, splitBold } from "@/lib/plan-format";

describe("parsePlan", () => {
  it("splits paragraphs on blank lines", () => {
    expect(parsePlan("First part.\n\nSecond part.")).toEqual([
      { kind: "paragraph", text: "First part." },
      { kind: "paragraph", text: "Second part." },
    ]);
  });

  it("keeps line breaks inside a paragraph", () => {
    expect(parsePlan("Line one\nLine two")).toEqual([
      { kind: "paragraph", text: "Line one\nLine two" },
    ]);
  });

  it("collects hyphen, star and bullet characters into one list", () => {
    expect(parsePlan("- Hotel 2\n* Flight\n• Taxi")).toEqual([
      { kind: "list", items: ["Hotel 2", "Flight", "Taxi"] },
    ]);
  });

  it("treats numbered lines as list items", () => {
    expect(parsePlan("1. Book\n2) Pack")).toEqual([{ kind: "list", items: ["Book", "Pack"] }]);
  });

  it("styles a line that is exactly To settle as a heading", () => {
    expect(parsePlan("Stay at Hotel 2.\n\nTo settle\n- Check-in time")).toEqual([
      { kind: "paragraph", text: "Stay at Hotel 2." },
      { kind: "heading", text: "To settle" },
      { kind: "list", items: ["Check-in time"] },
    ]);
  });

  it("accepts To settle with a colon or different case", () => {
    expect(parsePlan("to settle:")).toEqual([{ kind: "heading", text: "to settle" }]);
  });

  it("does not turn a sentence that merely starts with To settle into a heading", () => {
    expect(parsePlan("To settle this, call the hotel.")).toEqual([
      { kind: "paragraph", text: "To settle this, call the hotel." },
    ]);
  });

  it("understands markdown headings and bold-only lines", () => {
    expect(parsePlan("## The plan\n\n**Budget**\nAbout $3,000")).toEqual([
      { kind: "heading", text: "The plan" },
      { kind: "heading", text: "Budget" },
      { kind: "paragraph", text: "About $3,000" },
    ]);
  });

  it("ends a paragraph when a list starts", () => {
    expect(parsePlan("Options:\n- A\n- B\nAfter")).toEqual([
      { kind: "paragraph", text: "Options:" },
      { kind: "list", items: ["A", "B"] },
      { kind: "paragraph", text: "After" },
    ]);
  });

  it("copes with Windows line endings and empty input", () => {
    expect(parsePlan("A\r\n\r\nB")).toHaveLength(2);
    expect(parsePlan("")).toEqual([]);
    expect(parsePlan("   \n \n")).toEqual([]);
  });

  it("leaves markup characters alone as plain text", () => {
    expect(parsePlan("<script>alert(1)</script>")).toEqual([
      { kind: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parsePlan with template sections", () => {
  const sections = ["Where to stay", "Costs", "To settle"];

  it("turns a line that is exactly a section name into a heading", () => {
    expect(parsePlan("Where to stay\nSeaside Inn\n\nCosts\n- Flights", sections)).toEqual([
      { kind: "heading", text: "Where to stay" },
      { kind: "paragraph", text: "Seaside Inn" },
      { kind: "heading", text: "Costs" },
      { kind: "list", items: ["Flights"] },
    ]);
  });

  it("ignores case, spacing and a trailing colon, and shows the line as written", () => {
    expect(parsePlan("  where to STAY:  ", sections)).toEqual([
      { kind: "heading", text: "where to STAY" },
    ]);
  });

  it("does not turn a longer sentence or a list item into a heading", () => {
    expect(parsePlan("Costs are low.\n- Costs", sections)).toEqual([
      { kind: "paragraph", text: "Costs are low." },
      { kind: "list", items: ["Costs"] },
    ]);
  });

  it("leaves those lines alone when no sections are given", () => {
    expect(parsePlan("Costs")).toEqual([{ kind: "paragraph", text: "Costs" }]);
  });

  it("still treats To settle as a heading when the template omits it", () => {
    expect(parsePlan("To settle\n- Hotel", ["Costs"])).toEqual([
      { kind: "heading", text: "To settle" },
      { kind: "list", items: ["Hotel"] },
    ]);
  });
});

describe("splitBold", () => {
  it("separates bold runs", () => {
    expect(splitBold("Stay at **Hotel 2** near the beach")).toEqual([
      { text: "Stay at ", bold: false },
      { text: "Hotel 2", bold: true },
      { text: " near the beach", bold: false },
    ]);
  });

  it("returns plain text unchanged", () => {
    expect(splitBold("nothing bold")).toEqual([{ text: "nothing bold", bold: false }]);
  });

  it("handles several bold runs and an unmatched marker", () => {
    expect(splitBold("**a** and **b** and **c")).toEqual([
      { text: "a", bold: true },
      { text: " and ", bold: false },
      { text: "b", bold: true },
      { text: " and **c", bold: false },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitBold("")).toEqual([]);
  });
});
