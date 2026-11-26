import type { SpaceSummary } from "@/lib/api.types";

export type SpaceCardProps = Readonly<{
  space: SpaceSummary;
  index?: number;
}>;
