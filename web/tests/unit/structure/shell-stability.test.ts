import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function globals(): string {
  return readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
}

describe("pages do not shift sideways when the scrollbar comes and goes", () => {
  it("always keeps room for the scrollbar", () => {
    const rule = /(?:^|\n)\s*html\s*\{([^}]*)\}/.exec(globals());

    expect(rule?.[1]).toMatch(/scrollbar-gutter:\s*stable/);
  });
});
