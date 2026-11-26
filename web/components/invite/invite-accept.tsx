"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type { InviteAcceptProps } from "@/components/invite/invite-accept.types";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export function InviteAccept({ token, spaceName, alreadyMember }: InviteAcceptProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idleLabel = alreadyMember ? "Open space" : "Accept invite";

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const result = await api.invites.accept(token);
      if (!result.already_member) {
        toast.success(`You joined ${spaceName}`);
      }
      router.push(`/spaces/${result.space_id}`);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-base text-muted-foreground">
        {alreadyMember
          ? "Open it to see what has been shared."
          : "Accept to see what has been shared and add your own."}
      </p>
      <ErrorNotice message={error} />
      <Button type="button" size="lg" onClick={() => void accept()} disabled={pending}>
        {pending ? "One moment…" : idleLabel}
      </Button>
    </div>
  );
}
