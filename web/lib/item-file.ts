const FALLBACK_NAME = "orbit-item";
const MAX_SLUG_LENGTH = 60;
const NOT_PART_OF_A_WORD = /[^\p{L}\p{M}\p{N}]+/gu;
const EDGE_DASHES = /^-+|-+$/g;

export function itemFileName(title: string): string {
  const slug = title
    .normalize("NFC")
    .toLowerCase()
    .replace(NOT_PART_OF_A_WORD, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_DASHES, "");
  return `${slug || FALLBACK_NAME}.md`;
}

export function itemMarkdown(title: string, content: string): string {
  const body = content.endsWith("\n") ? content : `${content}\n`;
  return `# ${title.trim()}\n\n${body}`;
}
