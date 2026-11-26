import type { InvitationsResponse } from "@/lib/api.types";

export const NO_INVITATIONS: InvitationsResponse = { invitations: [] };

export function withoutInvitation(
  current: InvitationsResponse | undefined,
  invitationId: string,
): InvitationsResponse {
  return {
    invitations: (current?.invitations ?? []).filter(
      (invitation) => invitation.id !== invitationId,
    ),
  };
}
