import type { Invitation } from "@/lib/api.types";
import type { SpaceLayout } from "@/lib/space-filters.types";

export type PendingSectionProps = Readonly<{
  invitations: readonly Invitation[];
  layout: SpaceLayout;
  onAccept: (invitation: Invitation) => Promise<void>;
  onDecline: (invitation: Invitation) => Promise<void>;
}>;
