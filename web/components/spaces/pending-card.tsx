"use client";

import { LockIcon, MailIcon } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorNotice } from "@/components/common/error-notice";
import { RelativeTime } from "@/components/common/relative-time";
import { InviteCover } from "@/components/spaces/invite-cover";
import type { PendingCardProps } from "@/components/spaces/pending-card.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { cssVars } from "@/lib/css-vars";
import { formatExpiresIn } from "@/lib/format";
import { trackPointer } from "@/lib/spotlight";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function PendingCard({
  invitation,
  index = 0,
  compact = false,
  onAccept,
  onDecline,
}: PendingCardProps) {
  const titleId = useId();
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const inviter = invitation.invited_by ?? "Someone";

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await onAccept(invitation);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
      setJoining(false);
    }
  }

  async function decline() {
    setDeclining(true);
    setDeclineError(null);
    try {
      await onDecline(invitation);
      setDeclineOpen(false);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setDeclineError(describeError(failure));
      }
    } finally {
      setDeclining(false);
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      aria-busy={joining}
      data-slot="pending-card"
      onPointerMove={trackPointer}
      style={cssVars({ "--i": index })}
      className={cn(
        "spotlight relative isolate flex overflow-hidden rounded-lg border border-dashed border-ember/70 bg-card shadow-card motion-safe:animate-rise motion-safe:[animation-delay:calc(min(var(--i,0),8)*55ms)]",
        compact ? "flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4" : "h-full flex-col",
      )}
    >
      {compact ? (
        <InviteCover className="relative z-10 hidden size-16 shrink-0 rounded-md border border-border sm:block sm:size-20" />
      ) : (
        <div className="relative aspect-[16/10] border-b border-border">
          <InviteCover className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <Badge variant="ember">
              <MailIcon aria-hidden="true" />
              Invitation
            </Badge>
          </div>
          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground glass">
              <LockIcon aria-hidden="true" className="size-3.5" />
              Private until you join
            </span>
          </div>
        </div>
      )}
      <div
        className={cn(
          "relative z-10 flex flex-1 gap-3",
          compact
            ? "min-w-0 flex-col sm:flex-row sm:items-center sm:justify-between"
            : "flex-col p-4",
        )}
      >
        <div className="min-w-0">
          <h3 id={titleId} className="truncate heading-card">
            {invitation.space_name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{inviter}</span> invited you{" "}
            <span aria-hidden="true">·</span> <RelativeTime date={invitation.invited_at} />
          </p>
          <p className="mt-0.5 text-xs font-medium text-ember-text">
            {formatExpiresIn(invitation.expires_at, now)}
          </p>
        </div>
        <div className={cn("flex flex-col gap-2", compact ? "sm:items-end" : "mt-auto")}>
          <ErrorNotice message={error} />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void join()}
              disabled={joining}
              aria-label={`Join space ${invitation.space_name}`}
            >
              {joining ? "Joining…" : "Join space"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeclineOpen(true)}
              disabled={joining}
              aria-label={`Decline invitation to ${invitation.space_name}`}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline this invitation?"
        description={`${inviter} invited you to ${invitation.space_name}. You won't see what is inside, and the invite link stops working.`}
        confirmLabel="Decline invitation"
        pendingLabel="Declining…"
        onConfirm={decline}
        pending={declining}
        error={declineError}
        destructive
      />
    </article>
  );
}
