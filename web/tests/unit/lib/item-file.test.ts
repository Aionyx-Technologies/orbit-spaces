import { describe, expect, it } from "vitest";

import { itemFileName, itemMarkdown } from "@/lib/item-file";

describe("itemFileName", () => {
  it("names the file from the title", () => {
    expect(itemFileName("Connector experience improvements")).toBe(
      "connector-experience-improvements.md",
    );
  });

  it("collapses punctuation and spaces into single dashes", () => {
    expect(itemFileName("  Hotel: 3 options -- under $150!  ")).toBe(
      "hotel-3-options-under-150.md",
    );
  });

  it("removes characters a file name cannot hold", () => {
    expect(itemFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j.md");
    expect(itemFileName("../../etc/passwd")).toBe("etc-passwd.md");
  });

  it("keeps letters and numbers from any language", () => {
    expect(itemFileName("Café plan")).toBe("café-plan.md");
    expect(itemFileName("गोवा यात्रा")).toBe("गोवा-यात्रा.md");
    expect(itemFileName("旅行 2026")).toBe("旅行-2026.md");
  });

  it("falls back to a plain name when nothing usable is left", () => {
    expect(itemFileName("")).toBe("orbit-item.md");
    expect(itemFileName("   ")).toBe("orbit-item.md");
    expect(itemFileName("!!! ???")).toBe("orbit-item.md");
    expect(itemFileName("🎉🎉")).toBe("orbit-item.md");
  });

  it("keeps long titles to a sensible length without a trailing dash", () => {
    const name = itemFileName(`${"word ".repeat(40)}end`);

    expect(name.endsWith(".md")).toBe(true);
    const slug = name.slice(0, -3);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("word-word")).toBe(true);
  });
});

describe("itemMarkdown", () => {
  it("puts the title as a heading, a blank line, then the content", () => {
    expect(itemMarkdown("Morning flight", "Leaves Dec 20 at 7:10")).toBe(
      "# Morning flight\n\nLeaves Dec 20 at 7:10\n",
    );
  });

  it("keeps the content exactly as it was written", () => {
    const content = "Line one\n\n- a\n- b\n\n    indented";

    expect(itemMarkdown("Plan", content)).toBe(`# Plan\n\n${content}\n`);
  });

  it("does not add a second newline when the content already ends with one", () => {
    expect(itemMarkdown("Plan", "Body\n")).toBe("# Plan\n\nBody\n");
  });

  it("trims the title only at its edges", () => {
    expect(itemMarkdown("  Big   plan ", "x")).toBe("# Big   plan\n\nx\n");
  });
});
