"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { DeleteSpaceDialogProps } from "@/components/space/delete-space-dialog.types";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export function DeleteSpaceDialog({
  spaceId,
  spaceName,
  open,
  onOpenChange,
}: DeleteSpaceDialogProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await api.spaces.remove(spaceId);
      toast.success("Space deleted");
      onOpenChange(false);
      router.push("/spaces");
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
        }
        onOpenChange(next);
      }}
      title={`Delete “${spaceName}”?`}
      description="This removes the space and everything shared in it, for everyone. It can't be undone."
      confirmLabel="Delete space"
      pendingLabel="Deleting…"
      destructive
      pending={pending}
      error={error}
      onConfirm={remove}
    />
  );
}
