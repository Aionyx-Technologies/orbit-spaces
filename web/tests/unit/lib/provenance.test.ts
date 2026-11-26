import { describe, expect, it } from "vitest";

import {
  describeProvenance,
  factSource,
  itemSource,
  ORBIT_SUGGESTION_ORIGIN,
} from "@/lib/provenance";
import { ALEX_ID, BLAKE_ID, makeFact, makeItem, makePlan } from "@/tests/unit/helpers/fixtures";

describe("describeProvenance", () => {
  it("names another person and the assistant they used", () => {
    expect(describeProvenance(itemSource(makeItem()), ALEX_ID)).toEqual({
      who: "Blake",
      via: "via Grok",
      isYou: false,
      isOrbit: false,
    });
  });

  it("says You for your own items", () => {
    const own = makeItem({
      shared_by: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null },
      via: "ChatGPT",
    });
    expect(describeProvenance(itemSource(own), ALEX_ID)).toMatchObject({
      who: "You",
      via: "via ChatGPT",
      isYou: true,
    });
  });

  it("says on the web for items shared from the page", () => {
    const web = makeItem({ via: "web", author_kind: "person" });
    expect(describeProvenance(itemSource(web), ALEX_ID).via).toBe("on the web");
  });

  it("labels plans as written by Orbit and never as you", () => {
    const provenance = describeProvenance(itemSource(makePlan()), BLAKE_ID);
    expect(provenance).toEqual({
      who: "Orbit",
      via: "requested via ChatGPT",
      isYou: false,
      isOrbit: true,
    });
  });

  it("says requested on the web for plans started from the page", () => {
    expect(describeProvenance(itemSource(makePlan({ via: "web" })), ALEX_ID).via).toBe(
      "requested on the web",
    );
  });

  it("labels facts from an Orbit suggestion without naming an assistant", () => {
    const me = { user_id: ALEX_ID, display_name: "Alex", avatar_url: null };
    expect(describeProvenance({ person: me, via: ORBIT_SUGGESTION_ORIGIN }, ALEX_ID)).toEqual({
      who: "You",
      via: "suggested by Orbit",
      isYou: true,
      isOrbit: false,
    });
  });

  it("falls back for a former member", () => {
    const former = makeItem({ shared_by: null });
    expect(describeProvenance(itemSource(former), ALEX_ID).who).toBe("Former member");
  });

  it("treats a person with no display name as a former member", () => {
    const nameless = makeItem({
      shared_by: { user_id: null, display_name: null, avatar_url: null },
    });
    expect(describeProvenance(itemSource(nameless), ALEX_ID).who).toBe("Former member");
  });

  it("never claims an item for an unknown viewer", () => {
    expect(describeProvenance(itemSource(makeItem()), null).isYou).toBe(false);
  });

  it("works for facts", () => {
    const fact = makeFact({
      set_by: { user_id: BLAKE_ID, display_name: "Blake", avatar_url: null },
      via: "Grok",
    });
    expect(describeProvenance(factSource(fact), ALEX_ID)).toMatchObject({
      who: "Blake",
      via: "via Grok",
    });
  });
});
