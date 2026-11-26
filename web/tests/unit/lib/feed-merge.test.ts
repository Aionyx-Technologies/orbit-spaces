import { describe, expect, it } from "vitest";

import {
  addItem,
  applyFirstPage,
  applyOlderPage,
  compareItems,
  initialFeedState,
  removeItem,
} from "@/lib/feed-merge";
import { makeItem, makeItemsPage } from "@/tests/unit/helpers/fixtures";

function item(id: string, minute: number) {
  return makeItem({
    id,
    title: id,
    created_at: `2026-11-19T10:${String(minute).padStart(2, "0")}:00Z`,
  });
}

describe("compareItems", () => {
  it("puts newer items first", () => {
    expect(compareItems(item("b", 5), item("a", 1))).toBeLessThan(0);
    expect(compareItems(item("a", 1), item("b", 5))).toBeGreaterThan(0);
  });

  it("breaks ties by id, larger id first", () => {
    expect(compareItems(item("b", 5), item("a", 5))).toBeLessThan(0);
    expect(compareItems(item("a", 5), item("b", 5))).toBeGreaterThan(0);
  });

  it("treats the same item as equal", () => {
    expect(compareItems(item("a", 5), item("a", 5))).toBe(0);
  });

  it("compares by real time, not by string order", () => {
    const whole = makeItem({ id: "x", created_at: "2026-11-19T10:00:00Z" });
    const fraction = makeItem({ id: "y", created_at: "2026-11-19T10:00:00.500000Z" });
    expect(compareItems(fraction, whole)).toBeLessThan(0);
  });
});

describe("feed state", () => {
  it("starts from the first page", () => {
    const state = initialFeedState(makeItemsPage([item("a", 1)], "a"));
    expect(state).toEqual({ items: [item("a", 1)], nextBefore: "a", extended: false });
  });

  it("replaces everything when the first page is complete", () => {
    const state = initialFeedState(makeItemsPage([item("a", 1), item("b", 2)], null));
    const next = applyFirstPage(state, makeItemsPage([item("b", 2)], null));
    expect(next.items.map((entry) => entry.id)).toEqual(["b"]);
    expect(next.nextBefore).toBeNull();
  });

  it("prepends new items and keeps older loaded ones", () => {
    let state = initialFeedState(makeItemsPage([item("c", 3), item("b", 2)], "b"));
    state = applyOlderPage(state, makeItemsPage([item("a", 1)], null));
    const next = applyFirstPage(state, makeItemsPage([item("d", 4), item("c", 3)], "c"));
    expect(next.items.map((entry) => entry.id)).toEqual(["d", "c", "b", "a"]);
    expect(next.nextBefore).toBeNull();
    expect(next.extended).toBe(true);
  });

  it("drops retracted items that fall inside the refreshed first page", () => {
    const state = initialFeedState(makeItemsPage([item("c", 3), item("b", 2), item("a", 1)], "a"));
    const next = applyFirstPage(state, makeItemsPage([item("c", 3), item("a", 1)], "a"));
    expect(next.items.map((entry) => entry.id)).toEqual(["c", "a"]);
  });

  it("updates the cursor when nothing older has been loaded yet", () => {
    const state = initialFeedState(makeItemsPage([item("b", 2), item("a", 1)], "a"));
    const next = applyFirstPage(state, makeItemsPage([item("c", 3), item("b", 2)], "b"));
    expect(next.nextBefore).toBe("b");
    expect(next.items.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("keeps the older cursor once more pages were loaded", () => {
    let state = initialFeedState(makeItemsPage([item("c", 3), item("b", 2)], "b"));
    state = applyOlderPage(state, makeItemsPage([item("a", 1)], "a"));
    const next = applyFirstPage(state, makeItemsPage([item("d", 4), item("c", 3)], "c"));
    expect(next.nextBefore).toBe("a");
  });

  it("appends an older page without duplicates and marks it extended", () => {
    const state = initialFeedState(makeItemsPage([item("b", 2), item("a", 1)], "a"));
    const next = applyOlderPage(state, makeItemsPage([item("a", 1), item("z", 0)], null));
    expect(next.items.map((entry) => entry.id)).toEqual(["b", "a", "z"]);
    expect(next.nextBefore).toBeNull();
    expect(next.extended).toBe(true);
  });

  it("adds a locally shared item in order, once", () => {
    const state = initialFeedState(makeItemsPage([item("b", 2)], null));
    const once = addItem(state, item("c", 3));
    const twice = addItem(once, item("c", 3));
    expect(twice.items.map((entry) => entry.id)).toEqual(["c", "b"]);
  });

  it("removes an item", () => {
    const state = initialFeedState(makeItemsPage([item("b", 2), item("a", 1)], null));
    expect(removeItem(state, "b").items.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("handles an empty page that still has a cursor", () => {
    const state = initialFeedState(makeItemsPage([item("a", 1)], "a"));
    const next = applyFirstPage(state, { items: [], next_before: "a" });
    expect(next.items).toEqual([]);
  });
});
