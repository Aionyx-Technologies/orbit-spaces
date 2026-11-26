"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { RetractDialogProps } from "@/components/space/retract-dialog.types";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export function RetractDialog({ item, onClose, onRetracted }: RetractDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retract() {
    if (!item) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.items.retract(item.id);
      onRetracted(item);
      toast.success("Retracted");
      onClose();
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
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      title={item ? `Retract “${item.title}”?` : "Retract this item?"}
      description="It disappears for everyone in this space. A plan that already used it keeps what it said."
      confirmLabel="Retract"
      pendingLabel="Retracting…"
      destructive
      pending={pending}
      error={error}
      onConfirm={retract}
    />
  );
}
