import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import type { ContrastData } from "./a11y.types";

const STANDARDS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectAccessible(page: Page, where: string, scope?: string): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags(STANDARDS);
  const results = await (scope ? builder.include(scope) : builder).analyze();
  const problems = results.violations.map((violation) => {
    const targets = violation.nodes.flatMap((node) => node.target.map(String)).slice(0, 3);
    const colours = violation.nodes.slice(0, 3).flatMap((node) =>
      node.any.flatMap((check) => {
        const data = check.data as ContrastData | null;
        return data?.fgColor
          ? [`${data.fgColor} on ${data.bgColor} (${data.contrastRatio}:1)`]
          : [];
      }),
    );
    const detail = colours.length > 0 ? ` [${colours.join(" | ")}]` : "";
    return `${violation.id} (${violation.impact}): ${targets.join(" | ")}${detail}`;
  });
  expect(problems, `${where} should have no accessibility problems`).toEqual([]);
}
