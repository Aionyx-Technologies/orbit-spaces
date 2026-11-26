import type { SpaceSummary } from "@/lib/api.types";

export type SpaceActivityProps = Readonly<{
  space: Pick<SpaceSummary, "latest" | "created_at" | "fact_count">;
  className?: string;
}>;

export type OwnerBadgeProps = Readonly<{
  space: Pick<SpaceSummary, "is_creator" | "owner_name">;
  className?: string;
}>;

export type HighlightChipsProps = Readonly<{
  space: Pick<SpaceSummary, "highlights" | "latest">;
  limit?: number;
  className?: string;
}>;
