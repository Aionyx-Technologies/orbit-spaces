import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

function readBytes(path: string): Buffer {
  return readFileSync(join(ROOT, path));
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
  return {
    width: bytes.readUInt32BE(PNG_WIDTH_OFFSET),
    height: bytes.readUInt32BE(PNG_HEIGHT_OFFSET),
  };
}

describe("the favicon", () => {
  const svg = readBytes("app/icon.svg").toString("utf8");

  it("is one self-contained svg document", () => {
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 32 32"');
  });

  it("loads nothing from outside, runs no code and has no comments", () => {
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\shref=|xlink:href|@import|url\(|<image|<foreignObject/i);
    expect(svg).not.toContain("<!--");
  });

  it("switches to lighter colours in dark mode", () => {
    expect(svg).toContain("prefers-color-scheme:dark");
  });

  it("orbits the satellite, and stops when the person asks for reduced motion", () => {
    expect(svg).toContain("@keyframes orbit");
    expect(svg).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.orbit\{animation:none\}\}/);
  });
});

describe("the app icons", () => {
  it("makes the apple touch icon 180 by 180", () => {
    expect(pngSize(readBytes("app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("makes favicon.ico a valid icon holding 16, 32 and 48 pixel pictures", () => {
    const ico = readBytes("app/favicon.ico");

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes = Array.from({ length: count }, (_, index) => {
      const entry = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const picture = ico.subarray(offset, offset + length);
      expect(picture).toHaveLength(length);
      const declared = ico.readUInt8(entry);
      expect(pngSize(picture)).toEqual({ width: declared, height: declared });
      return declared;
    });
    expect(sizes).toEqual([16, 32, 48]);
  });
});
