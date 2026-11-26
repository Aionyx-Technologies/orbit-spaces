import type { Invitation } from "@/lib/api.types";

export type PendingCardProps = Readonly<{
  invitation: Invitation;
  index?: number;
  compact?: boolean;
  onAccept: (invitation: Invitation) => Promise<void>;
  onDecline: (invitation: Invitation) => Promise<void>;
}>;
