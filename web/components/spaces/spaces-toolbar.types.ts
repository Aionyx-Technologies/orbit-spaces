import type { SpaceLayout, SpaceSort } from "@/lib/space-filters.types";

export type SpacesSearchProps = Readonly<{
  value: string;
  onChange: (value: string) => void;
}>;

export type SpacesSortProps = Readonly<{
  value: SpaceSort;
  onChange: (value: SpaceSort) => void;
}>;

export type LayoutToggleProps = Readonly<{
  value: SpaceLayout;
  onChange: (value: SpaceLayout) => void;
}>;

export type SpacesToolbarProps = Readonly<{
  query: string;
  onQueryChange: (value: string) => void;
  sort: SpaceSort;
  onSortChange: (value: SpaceSort) => void;
  layout: SpaceLayout;
  onLayoutChange: (value: SpaceLayout) => void;
}>;
