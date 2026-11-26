import type { ShellWidth } from "@/lib/shell.types";

const CONTENT_WIDTHS: Readonly<Record<ShellWidth, string>> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
  gallery: "max-w-6xl",
};

export const LOGO_LINK_CLASS = "flex rounded-md";

export function contentWidth(width: ShellWidth): string {
  return CONTENT_WIDTHS[width];
}

export function headerWidth(): string {
  return CONTENT_WIDTHS.gallery;
}
