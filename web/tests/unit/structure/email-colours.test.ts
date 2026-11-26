import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = join(process.cwd(), "..");
const EMAIL_FOLDER = join(REPO, "api", "orbit", "templates", "email");
const GLOBALS_CSS = join(process.cwd(), "app", "globals.css");
const HEX_COLOUR = /#[0-9a-fA-F]{6,8}\b/g;
const ROOT_BLOCK = /:root\s*\{([\s\S]*?)\n\}/;
const DECLARATION = /--([\w-]+):\s*([^;]+);/g;
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
const LIGHT_DARK_PREFIX = "light-dark(";

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") depth -= 1;
    if (text[index] === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function channel(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(gamma * 255);
}

function oklchToHex(value: string): string | null {
  const match = OKLCH.exec(value.replace(/\s+/g, " ").trim());
  if (!match) {
    return null;
  }
  const lightness = Number.parseFloat(match[1] ?? "");
  const chroma = Number.parseFloat(match[2] ?? "");
  const radians = (Number.parseFloat(match[3] ?? "") * Math.PI) / 180;
  const alphaText = match[4];
  const alpha =
    alphaText === undefined
      ? 1
      : Number.parseFloat(alphaText) / (alphaText.endsWith("%") ? 100 : 1);
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((component) => channel(component).toString(16).padStart(2, "0"));
  const opacity =
    alpha < 1
      ? Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")
      : "";
  return `#${rgb.join("")}${opacity}`;
}

function lightColours(): Set<string> {
  const block = ROOT_BLOCK.exec(readFileSync(GLOBALS_CSS, "utf8"))?.[1] ?? "";
  const colours = new Set<string>();
  for (const declaration of block.matchAll(DECLARATION)) {
    const value = (declaration[2] ?? "").replace(/\s+/g, " ").trim();
    const light = value.startsWith(LIGHT_DARK_PREFIX)
      ? splitTopLevel(value.slice(LIGHT_DARK_PREFIX.length, -1))[0]
      : value;
    const hex = oklchToHex(light ?? "");
    if (hex) {
      colours.add(hex);
    }
  }
  return colours;
}

const templates = readdirSync(EMAIL_FOLDER).filter((name) => name.endsWith(".html"));

describe("email templates", () => {
  it("are found", () => {
    expect(templates).toContain("base.html");
  });

  it.each(templates)("%s uses only light colours from the design tokens", (name) => {
    const html = readFileSync(join(EMAIL_FOLDER, name), "utf8");
    const used = [...new Set(html.match(HEX_COLOUR) ?? [])].map((colour) => colour.toLowerCase());

    expect(used.filter((colour) => !lightColours().has(colour))).toEqual([]);
  });
});
