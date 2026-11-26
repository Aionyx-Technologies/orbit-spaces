"use client";

import { Loader2Icon, MailIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { WaitingInvitesProps } from "@/components/space/waiting-invites.types";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api";
import type { WaitingInvite } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { formatExpiresIn, formatRelativeTime, plural } from "@/lib/format";

type Busy = Readonly<{ id: string; action: "resend" | "cancel" }>;

export function WaitingInvites({ spaceId, invites, onChanged }: WaitingInvitesProps) {
  const [busy, setBusy] = useState<Busy | null>(null);

  if (invites.length === 0) {
    return null;
  }

  async function run(invite: WaitingInvite, action: Busy["action"]) {
    if (busy) {
      return;
    }
    setBusy({ id: invite.id, action });
    try {
      if (action === "resend") {
        await api.invites.resend(spaceId, invite.id);
        toast.success(`Sent a new invite to ${invite.email}`);
      } else {
        await api.invites.cancel(spaceId, invite.id);
        toast.success(`Cancelled the invite to ${invite.email}`);
      }
      onChanged?.();
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        toast.error(describeError(failure));
        onChanged?.();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
      <h3 id="waiting-title" className="text-sm font-medium text-muted-foreground">
        Waiting to join
      </h3>
      <ul className="flex flex-col gap-4" aria-label={plural(invites.length, "invite")}>
        {invites.map((invite) => {
          const expired = invite.status === "expired";
          const working = busy?.id === invite.id ? busy.action : null;
          return (
            <li key={invite.id} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-muted-foreground"
              >
                <MailIcon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium" title={invite.email}>
                  {invite.email}
                </span>
                <span className="text-sm text-muted-foreground">
                  {expired ? (
                    <>
                      <span className="font-medium text-ember-text">Expired</span>
                      {" · "}invited {formatRelativeTime(invite.invited_at)}
                    </>
                  ) : (
                    <>
                      Invited {formatRelativeTime(invite.invited_at)} ·{" "}
                      {formatExpiresIn(invite.expires_at)}
                    </>
                  )}
                </span>
                <div className="mt-1 -ml-2 flex flex-wrap gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    className="h-8 px-2"
                    aria-label={`${expired ? "Re-invite" : "Resend the invite to"} ${invite.email}`}
                    onClick={() => void run(invite, "resend")}
                  >
                    {working === "resend" ? (
                      <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                    ) : (
                      <RotateCwIcon aria-hidden="true" />
                    )}
                    {working === "resend" ? "Sending…" : expired ? "Re-invite" : "Resend"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={`Cancel the invite to ${invite.email}`}
                    className="h-8 px-2 text-muted-foreground"
                    onClick={() => void run(invite, "cancel")}
                  >
                    {working === "cancel" ? (
                      <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                    ) : (
                      <XIcon aria-hidden="true" />
                    )}
                    Cancel
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
