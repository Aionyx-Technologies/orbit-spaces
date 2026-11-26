import { describe, expect, it } from "vitest";

import { unsetFacts, upsertFact } from "@/lib/facts";
import { makeFact } from "@/tests/unit/helpers/fixtures";

describe("upsertFact", () => {
  it("appends a new fact", () => {
    const facts = [makeFact({ key: "Dates" })];
    expect(
      upsertFact(facts, makeFact({ key: "Budget", value: "$3,000" })).map((f) => f.key),
    ).toEqual(["Dates", "Budget"]);
  });

  it("replaces a fact with the same key, ignoring case, in place", () => {
    const facts = [makeFact({ key: "Dates" }), makeFact({ key: "Budget", value: "old" })];
    const updated = upsertFact(facts, makeFact({ key: "budget", value: "new" }));
    expect(updated.map((fact) => fact.value)).toEqual(["Dec 20 to 23", "new"]);
    expect(updated).toHaveLength(2);
  });

  it("does not change the original list", () => {
    const facts = [makeFact()];
    upsertFact(facts, makeFact({ key: "Other" }));
    expect(facts).toHaveLength(1);
  });
});

describe("unsetFacts", () => {
  const suggested = [
    { key: "Dates", hint: "When you are travelling" },
    { key: "Budget", hint: "Total for the trip" },
    { key: "Destination", hint: "Where you are going" },
  ];

  it("keeps only the suggestions nobody has set, in template order", () => {
    expect(unsetFacts(suggested, [makeFact({ key: "Budget" })]).map((fact) => fact.key)).toEqual([
      "Dates",
      "Destination",
    ]);
  });

  it("ignores case when matching a set fact", () => {
    expect(unsetFacts(suggested, [makeFact({ key: "dates" })]).map((fact) => fact.key)).toEqual([
      "Budget",
      "Destination",
    ]);
  });

  it("lists everything when nothing is set and nothing when all are", () => {
    expect(unsetFacts(suggested, [])).toEqual(suggested);
    expect(
      unsetFacts(
        suggested,
        suggested.map((fact) => makeFact({ key: fact.key })),
      ),
    ).toEqual([]);
  });

  it("does not hide a suggestion because of a fact with a different name", () => {
    expect(unsetFacts(suggested, [makeFact({ key: "Hotel" })])).toHaveLength(3);
  });
});
