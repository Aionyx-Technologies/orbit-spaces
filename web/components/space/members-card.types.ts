import type { EmailFrequency, Member, WaitingInvite } from "@/lib/api.types";

export type MembersCardProps = Readonly<{
  spaceId: string;
  members: Member[];
  ownerId: string | null;
  notifyEmail: boolean;
  frequency: EmailFrequency;
  onNotifyChanged: (notifyEmail: boolean) => void;
  invites?: WaitingInvite[];
  onInvitesChanged?: () => void;
}>;
