import type { Me, SpacesResponse } from "@/lib/api.types";

export type PreferencesSectionProps = Readonly<{
  me: Pick<Me, "time_zone" | "default_space_id">;
  initialSpaces: SpacesResponse;
}>;
