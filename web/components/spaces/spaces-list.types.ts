import type { SpaceSummary } from "@/lib/api.types";
import type { SpaceLayout } from "@/lib/space-filters.types";

export type SpacesListProps = Readonly<{
  spaces: readonly SpaceSummary[];
  layout: SpaceLayout;
  heading: string;
  headingVisible: boolean;
}>;
