import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["app", "components", "lib"];
const EXTENSIONS = [".tsx", ".ts"];
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g;
const DARK_COLOUR_OVERRIDE =
  /\bdark:(bg|text|border|fill|stroke|ring|from|to|via|shadow|outline|divide|placeholder)-/;
const ALLOWED_RAW_COLOURS: Record<string, string[]> = {
  "components/brand/assistant-glyph.tsx": ["#D97757", "#FAF1EB", "#FFFFFF"],
  "components/ui/button.tsx": ["oklch("],
  "app/layout.tsx": ["#f9fafd", "#0a0c13"],
};

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function productSources(): [string, string][] {
  return SOURCE_FOLDERS.flatMap((folder) => sourceFiles(join(ROOT, folder)))
    .map((file): [string, string] => [
      relative(ROOT, file).replaceAll("\\", "/"),
      readFileSync(file, "utf8"),
    ])
    .filter(([file]) => !/\.test\.tsx?$/.test(file));
}

describe("components use design tokens, not raw colours", () => {
  it("writes no hex, rgb, hsl or oklch colour outside the allowed places", () => {
    const offences: string[] = [];
    for (const [file, source] of productSources()) {
      const allowed = ALLOWED_RAW_COLOURS[file] ?? [];
      source.split("\n").forEach((line, index) => {
        for (const colour of line.match(RAW_COLOUR) ?? []) {
          if (!allowed.some((permitted) => colour.startsWith(permitted))) {
            offences.push(`${file}:${index + 1} uses ${colour}`);
          }
        }
      });
    }

    expect(
      offences,
      "Use a design token such as bg-primary or text-muted-foreground. Colours are defined in app/globals.css.",
    ).toEqual([]);
  });

  it("writes no dark: colour overrides, because the tokens switch by themselves", () => {
    const offences = productSources().flatMap(([file, source]) =>
      source
        .split("\n")
        .flatMap((line, index) =>
          DARK_COLOUR_OVERRIDE.test(line) ? [`${file}:${index + 1}`] : [],
        ),
    );

    expect(
      offences,
      "Remove the dark: colour and use a design token, which already has a dark value.",
    ).toEqual([]);
  });
});
