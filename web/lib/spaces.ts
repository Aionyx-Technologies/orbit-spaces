import type { SpaceSummary, SpaceSummaryWire } from "@/lib/api.types";

export function withPreview(space: SpaceSummaryWire): SpaceSummary {
  return {
    ...space,
    owner_name: space.owner_name ?? null,
    last_activity_at: space.last_activity_at ?? space.created_at,
    note_count: space.note_count ?? 0,
    fact_count: space.fact_count ?? 0,
    has_plan: space.has_plan ?? false,
    highlights: space.highlights ?? [],
    latest: space.latest ?? null,
    sources: space.sources ?? [],
    new_count: space.new_count ?? 0,
  };
}
