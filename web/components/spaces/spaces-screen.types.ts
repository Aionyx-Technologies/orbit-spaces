import type { InvitationsResponse, SpacesResponse } from "@/lib/api.types";
import type { SpaceTab } from "@/lib/space-filters.types";

export type SpacesScreenProps = Readonly<{
  initial: SpacesResponse;
  initialInvitations: InvitationsResponse;
  initialTab?: SpaceTab;
  openNewSpace?: boolean;
}>;
