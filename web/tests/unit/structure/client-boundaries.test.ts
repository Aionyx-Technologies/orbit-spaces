import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["app", "components", "lib"];
const HANDLER_ATTRIBUTE = /\son[A-Z][A-Za-z]*=\{/;
const CLIENT_DIRECTIVE = /^\s*["']use client["'];?/;
const ALIAS_IMPORT = /(?:from|import)\s*\(?\s*["']@\/([^"']+)["']/g;
const SERVER_ENTRY = /(^|\/)(page|layout|loading|not-found|template|default|route)\.tsx?$/;
const EXTENSIONS = [".tsx", ".ts"];

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function readSources(): Map<string, string> {
  const sources = new Map<string, string>();
  for (const folder of SOURCE_FOLDERS) {
    for (const file of sourceFiles(join(ROOT, folder))) {
      sources.set(relative(ROOT, file).replaceAll("\\", "/"), readFileSync(file, "utf8"));
    }
  }
  return sources;
}

function resolveImport(specifier: string, files: Set<string>): string | undefined {
  const candidates = [
    specifier,
    ...EXTENSIONS.map((extension) => `${specifier}${extension}`),
    ...EXTENSIONS.map((extension) => `${specifier}/index${extension}`),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

function reachedByServerComponents(sources: Map<string, string>): Set<string> {
  const files = new Set(sources.keys());
  const isClient = (file: string) => CLIENT_DIRECTIVE.test(sources.get(file) ?? "");
  const queue = [...files].filter((file) => SERVER_ENTRY.test(file) && !isClient(file));
  const reached = new Set(queue);
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    for (const match of (sources.get(current) ?? "").matchAll(ALIAS_IMPORT)) {
      const target = resolveImport(match[1], files);
      if (target !== undefined && !reached.has(target) && !isClient(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  return reached;
}

describe("server and client component boundaries", () => {
  const sources = readSources();
  const reached = reachedByServerComponents(sources);

  it("never attaches an event handler in a module that a server component renders", () => {
    const offenders = [...reached].filter((file) =>
      HANDLER_ATTRIBUTE.test(sources.get(file) ?? ""),
    );

    expect(offenders).toEqual([]);
  });

  it("follows imports from server entry points up to each client boundary", () => {
    expect(reached.has("app/page.tsx")).toBe(true);
    expect(reached.has("components/landing/landing.tsx")).toBe(true);
    expect(reached.has("components/settings/settings-screen.tsx")).toBe(true);
    expect(reached.has("components/settings/security-section.tsx")).toBe(false);
    expect(reached.has("components/settings/delete-account-section.tsx")).toBe(false);
    expect(reached.has("components/assistants/assistants-screen.tsx")).toBe(true);
    expect(reached.has("components/assistants/connections-section.tsx")).toBe(false);
    expect(reached.has("components/space/feed.tsx")).toBe(false);
  });
});
