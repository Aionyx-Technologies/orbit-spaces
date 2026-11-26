"use client";

import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { navigateTo } from "@/lib/navigation";

const CONFIRM_WORD = "delete";

export function DeleteAccountSection() {
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setPending(true);
    setError(null);
    try {
      await api.me.remove();
      navigateTo("/");
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
      setPending(false);
    }
  }

  return (
    <Card aria-labelledby="delete-account-title" role="region" className="border-destructive/40">
      <CardHeader>
        <CardTitle id="delete-account-title">Delete account</CardTitle>
        <CardDescription>
          Deleting your account removes your sessions, connections and memberships, and retracts
          what you shared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={() => setDeleting(true)}>
          <Trash2Icon aria-hidden="true" className="text-destructive" />
          <span className="text-destructive">Delete account</span>
        </Button>
      </CardContent>
      <ConfirmDialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) {
            setTyped("");
            setError(null);
          }
        }}
        title="Delete your account?"
        description="This can't be undone. Spaces you created stay with the other members, or are deleted if you are the only one in them."
        confirmLabel="Delete account"
        pendingLabel="Deleting…"
        destructive
        pending={pending}
        error={error}
        confirmDisabled={typed.trim().toLowerCase() !== CONFIRM_WORD}
        onConfirm={deleteAccount}
      >
        <div className="grid gap-2">
          <Label htmlFor="confirm-delete">Type “{CONFIRM_WORD}” to confirm</Label>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
