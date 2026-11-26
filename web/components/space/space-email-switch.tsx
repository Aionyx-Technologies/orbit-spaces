"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type { SpaceEmailSwitchProps } from "@/components/space/space-email-switch.types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export function SpaceEmailSwitch({
  spaceId,
  notifyEmail,
  frequency,
  onChanged,
}: SpaceEmailSwitchProps) {
  const [error, setError] = useState<string | null>(null);

  if (frequency === "off") {
    return (
      <p className="text-sm text-muted-foreground">
        Activity emails are off for your account.{" "}
        <Link href="/settings" className="font-medium text-primary underline underline-offset-4">
          Change that in Settings
        </Link>
        .
      </p>
    );
  }

  async function toggle(next: boolean) {
    setError(null);
    onChanged(next);
    try {
      await api.spaces.setNotify(spaceId, next);
      toast.success(next ? "Email notifications on" : "Email notifications off");
    } catch (failure) {
      onChanged(!next);
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`space-email-${spaceId}`} className="min-w-0 text-base">
          Email me about this space
        </Label>
        <Switch
          id={`space-email-${spaceId}`}
          checked={notifyEmail}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}
