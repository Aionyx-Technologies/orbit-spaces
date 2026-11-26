import type { SpacesEmptyKind } from "@/lib/space-filters.types";

export type SpacesEmptyProps = Readonly<{
  kind: SpacesEmptyKind;
  query?: string;
  onClearSearch?: () => void;
}>;
