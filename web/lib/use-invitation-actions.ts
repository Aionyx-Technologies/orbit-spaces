import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Invitation } from "@/lib/api.types";

export function useInvitationActions(forget: (invitationId: string) => Promise<unknown>) {
  const router = useRouter();

  const accept = useCallback(
    async (invitation: Invitation) => {
      const result = await api.invitations.accept(invitation.id);
      await forget(invitation.id);
      if (!result.already_member) {
        toast.success(`You joined ${invitation.space_name}`);
      }
      router.push(`/spaces/${result.space_id}`);
    },
    [forget, router],
  );

  const decline = useCallback(
    async (invitation: Invitation) => {
      await api.invitations.decline(invitation.id);
      await forget(invitation.id);
      toast(`Declined the invitation to ${invitation.space_name}`);
    },
    [forget],
  );

  return { accept, decline };
}
