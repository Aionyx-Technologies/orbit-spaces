import type { SpaceCounts, SpaceTab } from "@/lib/space-filters.types";

export type FilterTabsProps = Readonly<{
  value: SpaceTab;
  counts: SpaceCounts;
}>;
