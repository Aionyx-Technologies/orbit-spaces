import type { Me, SpacesResponse } from "@/lib/api.types";

export type SettingsScreenProps = Readonly<{
  me: Me;
  initialSpaces: SpacesResponse;
}>;
