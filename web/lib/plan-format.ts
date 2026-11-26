import type { InlineSegment, PlanBlock } from "@/lib/plan-format.types";

const BULLET = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*\S)\s*$/;
const MARKDOWN_HEADING = /^\s*#{1,6}\s+(.*\S)\s*$/;
const BOLD_ONLY_LINE = /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/;
const BOLD_PAIR = /\*\*(.+?)\*\*/g;
const SETTLE_HEADING = /^to settle:?$/i;

function headingText(line: string): string | null {
  const markdown = MARKDOWN_HEADING.exec(line);
  const bold = BOLD_ONLY_LINE.exec(line);
  const candidate = (markdown?.[1] ?? bold?.[1] ?? line).trim().replace(/:$/, "");
  if (markdown || bold) {
    return candidate;
  }
  return SETTLE_HEADING.test(line.trim()) ? candidate : null;
}

function foldSection(name: string): string {
  return name.trim().replace(/:$/, "").trim().toLowerCase();
}

export function parsePlan(text: string, sections: readonly string[] = []): PlanBlock[] {
  const sectionNames = new Set(sections.map(foldSection));
  const blocks: PlanBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading =
      headingText(line) ??
      (sectionNames.has(foldSection(line)) ? line.trim().replace(/:$/, "") : null);
    if (heading !== null) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet?.[1]) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function splitBold(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD_PAIR)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), bold: false });
    }
    segments.push({ text: match[1] ?? "", bold: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false });
  }
  return segments;
}
