import { describe, expect, it } from "vitest";

import { assistantKey, personTone, sourceLabel, sourceTone, toneVars } from "@/lib/assistants";
import { buildCoverArt } from "@/lib/cover-art";
import { hashString } from "@/lib/hash";
import { ALEX, BLAKE, makeQuietSpace, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";

describe("hashString", () => {
  it("is stable, unsigned and sensitive to the input", () => {
    expect(hashString("orbit")).toBe(hashString("orbit"));
    expect(hashString("orbit")).not.toBe(hashString("orbiT"));
    expect(hashString("")).toBe(0x811c9dc5);
    for (const value of ["a", "space-1", "😀 emoji", "x".repeat(500)]) {
      const hash = hashString(value);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe("sourceTone", () => {
  it.each([
    ["ChatGPT", 172],
    ["chatgpt", 172],
    ["Claude Desktop", 45],
    ["Grok", 270],
    ["Gemini", 258],
    ["web", 277],
    ["  WEB ", 277],
  ])("gives %s a fixed hue", (name, hue) => {
    expect(sourceTone(name).hue).toBe(hue);
  });

  it("keeps Grok close to neutral so it stays calm next to the others", () => {
    expect(sourceTone("Grok").chroma).toBeLessThan(0.05);
  });

  it("gives an unknown assistant the same colour every time", () => {
    const first = sourceTone("Some New Assistant");
    expect(sourceTone("Some New Assistant")).toEqual(first);
    expect(first.hue).toBeGreaterThanOrEqual(0);
    expect(first.hue).toBeLessThan(360);
    expect(first.chroma).toBeGreaterThan(0);
  });

  it("gives a person a stable colour and exposes tones as CSS variables", () => {
    expect(personTone("user-1")).toEqual(personTone("user-1"));
    expect(toneVars({ hue: 10, chroma: 0.2 })).toEqual({ "--h": 10, "--c": 0.2 });
  });
});

describe("assistantKey", () => {
  it.each([
    ["ChatGPT", "chatgpt"],
    ["chatgpt.com", "chatgpt"],
    ["OpenAI Codex", "codex"],
    ["Claude", "claude"],
    ["claude.ai", "claude"],
    ["Anthropic Console", "claude"],
    ["Grok", "grok"],
    ["Grok 4", "grok"],
  ])("recognises %s as %s", (name, expected) => {
    expect(assistantKey(name)).toBe(expected);
  });

  it.each(["", "web", "orbit", "Gemini", "Copilot", "Some New Assistant"])(
    "has no logo for %j",
    (name) => {
      expect(assistantKey(name)).toBeNull();
    },
  );
});

describe("sourceLabel", () => {
  it("names the web, keeps assistant names and never returns nothing", () => {
    expect(sourceLabel("web")).toBe("Web");
    expect(sourceLabel(" Grok ")).toBe("Grok");
    expect(sourceLabel("  ")).toBe("Unknown");
  });
});

describe("buildCoverArt", () => {
  it("is deterministic for the same space", () => {
    const space = makeSpaceSummary();
    expect(buildCoverArt(space)).toEqual(buildCoverArt(space));
  });

  it("looks different for different spaces", () => {
    const seen = new Set(
      Array.from(
        { length: 30 },
        (_, index) => buildCoverArt(makeSpaceSummary({ id: `s-${index}` })).hue,
      ),
    );
    expect(seen.size).toBeGreaterThan(3);
  });

  it("puts people first, then assistants, each on its own orbit", () => {
    const art = buildCoverArt(
      makeSpaceSummary({ members: [ALEX, BLAKE], sources: ["ChatGPT", "Grok"] }),
    );

    expect(art.satellites.map((satellite) => satellite.kind)).toEqual([
      "person",
      "person",
      "assistant",
      "assistant",
    ]);
    expect(new Set(art.satellites.map((satellite) => satellite.key)).size).toBe(4);
    expect(art.rings).toHaveLength(3);
    for (const satellite of art.satellites) {
      expect(art.rings.some((ring) => ring.rx === satellite.rx && ring.ry === satellite.ry)).toBe(
        true,
      );
    }
  });

  it("caps how many people and assistants it draws", () => {
    const members = Array.from({ length: 9 }, (_, index) => ({ ...ALEX, user_id: `u${index}` }));
    const art = buildCoverArt(
      makeSpaceSummary({ members, sources: ["a", "b", "c", "d", "e", "f"] }),
    );

    expect(art.satellites.filter((satellite) => satellite.kind === "person")).toHaveLength(5);
    expect(art.satellites.filter((satellite) => satellite.kind === "assistant")).toHaveLength(4);
  });

  it("grows the core with what has been shared, up to a limit", () => {
    const quiet = buildCoverArt(makeQuietSpace());
    const some = buildCoverArt(makeSpaceSummary({ note_count: 3, fact_count: 2 }));
    const lots = buildCoverArt(makeSpaceSummary({ note_count: 400, fact_count: 400 }));
    const more = buildCoverArt(makeSpaceSummary({ note_count: 4000, fact_count: 0 }));

    expect(quiet.empty).toBe(true);
    expect(some.empty).toBe(false);
    expect(quiet.coreRadius).toBeLessThan(some.coreRadius);
    expect(some.coreRadius).toBeLessThan(lots.coreRadius);
    expect(lots.coreRadius).toBe(more.coreRadius);
    expect(lots.coreRadius).toBeLessThanOrEqual(28);
  });

  it("keeps the tilt gentle so the orbits stay inside the picture", () => {
    for (let index = 0; index < 50; index += 1) {
      const { tilt } = buildCoverArt(makeSpaceSummary({ id: `tilt-${index}` }));
      expect(Math.abs(tilt)).toBeLessThanOrEqual(25);
    }
  });
});
