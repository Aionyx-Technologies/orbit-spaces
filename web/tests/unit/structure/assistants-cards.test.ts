import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["app", "components", "lib"];
const EXTENSIONS = [".tsx", ".ts"];
const ASSISTANT_CARDS =
  /\b(ConnectSection|ConnectionsSection)\b|connect-section|connections-section/;
const ASSISTANTS_FOLDER = "components/assistants/";

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
  return SOURCE_FOLDERS.flatMap((folder) => sourceFiles(join(ROOT, folder))).map(
    (file): [string, string] => [
      relative(ROOT, file).replaceAll("\\", "/"),
      readFileSync(file, "utf8"),
    ],
  );
}

describe("the assistant setup lives on the Assistants page only", () => {
  it("is not rendered or imported by anything outside components/assistants", () => {
    const offenders = productSources()
      .filter(([file]) => !file.startsWith(ASSISTANTS_FOLDER))
      .filter(([, source]) => ASSISTANT_CARDS.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it("is rendered by the assistants screen and by nothing else", () => {
    const renderers = productSources()
      .filter(([, source]) => /<(ConnectSection|ConnectionsSection)\b/.test(source))
      .map(([file]) => file);

    expect(renderers).toEqual(["components/assistants/assistants-screen.tsx"]);
  });

  it("has no card with the assistant titles in the settings components", () => {
    const titles = productSources()
      .filter(([file]) => file.startsWith("components/settings/"))
      .filter(([, source]) =>
        /<CardTitle[^>]*>\s*(Connect an assistant|Connected assistants)\s*</.test(source),
      )
      .map(([file]) => file);

    expect(titles).toEqual([]);
  });

  it("no longer keeps the moved files in components/settings", () => {
    const names = readdirSync(join(ROOT, "components", "settings"));

    expect(names.filter((name) => /connect/.test(name))).toEqual([]);
  });
});
