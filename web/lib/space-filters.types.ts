export type SpaceTab = "all" | "yours" | "shared" | "pending";

export type SpaceSort = "activity" | "name" | "created";

export type SpaceLayout = "grid" | "list";

export type SpacesEmptyKind = "none" | "yours" | "shared" | "pending" | "search";

export type SpaceCounts = Readonly<{
  all: number;
  yours: number;
  shared: number;
  pending: number;
}>;
