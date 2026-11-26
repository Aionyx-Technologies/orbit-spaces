import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const REPO = join(ROOT, "..");
const SOURCE_FOLDERS = ["app", "components", "lib"];
const EXTENSIONS = [".tsx", ".ts"];
const API_TEMPLATES = join(REPO, "api", "orbit", "templates");
const SERIF_FACE = /(?<!sans-)serif|Instrument/i;
const REMOVED_STYLES = /\b(text-title|text-heading|text-subheading|font-display|font-serif)\b/;

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function templateFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? templateFiles(path) : [path];
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

function globals(): string {
  return readFileSync(join(ROOT, "app", "globals.css"), "utf8");
}

function utility(name: string): string {
  const block = new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\n\\}`).exec(globals());
  if (!block) {
    throw new Error(`The ${name} style is missing from app/globals.css.`);
  }
  return block[1] ?? "";
}

describe("the app uses one typeface", () => {
  it("bundles no serif font", () => {
    for (const folder of ["app/fonts", "public/fonts"]) {
      const files = readdirSync(join(ROOT, folder));

      expect(files.filter((name) => /serif/i.test(name))).toEqual([]);
    }
  });

  it("defines no display font and no serif stack in the stylesheet", () => {
    expect(globals()).not.toMatch(/--font-display/);
    expect(globals()).not.toMatch(SERIF_FACE);
  });

  it("loads only the sans font in the root layout", () => {
    const fonts = readFileSync(join(ROOT, "app", "fonts.ts"), "utf8");

    expect(fonts).not.toMatch(/displayFont|serif/i);
  });

  it("uses no serif style or removed heading class in any component", () => {
    const offences = productSources().flatMap(([file, source]) =>
      source
        .split("\n")
        .flatMap((line, index) => (REMOVED_STYLES.test(line) ? [`${file}:${index + 1}`] : [])),
    );

    expect(offences).toEqual([]);
  });

  it("draws no serif in the pages and emails the api renders", () => {
    const offences = templateFiles(API_TEMPLATES)
      .filter((file) => existsSync(file) && /\.html$/.test(file))
      .filter((file) => SERIF_FACE.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO, file).replaceAll("\\", "/"));

    expect(offences).toEqual([]);
  });
});

describe("heading styles are defined once", () => {
  it("makes a page heading 36px semibold, and 28px on phones", () => {
    const style = utility("heading-page");

    expect(style).toMatch(/font-size:\s*2\.25rem/);
    expect(style).toMatch(/font-weight:\s*600/);
    expect(style).toMatch(/line-height:\s*1\.15/);
    expect(style).toMatch(/letter-spacing:\s*-/);
    expect(style).toMatch(/@media \(width < 30rem\)\s*\{\s*font-size:\s*1\.75rem/);
  });

  it("makes a section heading 22px semibold", () => {
    const style = utility("heading-section");

    expect(style).toMatch(/font-size:\s*1\.375rem/);
    expect(style).toMatch(/font-weight:\s*600/);
    expect(style).toMatch(/line-height:\s*1\.25/);
  });

  it("makes a card heading 18px semibold", () => {
    const style = utility("heading-card");

    expect(style).toMatch(/font-size:\s*1\.125rem/);
    expect(style).toMatch(/font-weight:\s*600/);
  });

  it("sets no font family on a heading style, so all of them follow the body text", () => {
    for (const name of ["heading-page", "heading-section", "heading-card", "text-display"]) {
      expect(utility(name)).not.toMatch(/font-family/);
    }
  });
});
