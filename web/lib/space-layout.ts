import type { SpaceLayout } from "@/lib/space-filters.types";

const GRID_CLASS = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";
const LIST_CLASS = "grid grid-cols-1 gap-3";

export function layoutClass(layout: SpaceLayout): string {
  return layout === "grid" ? GRID_CLASS : LIST_CLASS;
}
