import type { WaitingInvite } from "@/lib/api.types";

export type WaitingInvitesProps = Readonly<{
  spaceId: string;
  invites: WaitingInvite[];
  onChanged?: () => void;
}>;
