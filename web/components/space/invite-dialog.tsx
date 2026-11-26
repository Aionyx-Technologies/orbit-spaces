"use client";

import { MailIcon } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useSWRConfig } from "swr";

import { CopyButton } from "@/components/common/copy-button";
import { ErrorNotice } from "@/components/common/error-notice";
import type { InviteDialogProps } from "@/components/space/invite-dialog.types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, describeError, spaceKey } from "@/lib/api";
import type { InviteCreated } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { formatFullDate } from "@/lib/format";

export function InviteDialog({ spaceId, children }: InviteDialogProps) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setCreated(null);
    setSentTo("");
    setError(null);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const invite = await api.invites.create(spaceId, email);
      setSentTo(email.trim());
      setCreated(invite);
      if (invite.emailed) {
        void mutate(spaceKey(spaceId));
      }
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            Anyone with the link can join this space, once. It expires in 7 days.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-link">Invite link</Label>
              <Input
                id="invite-link"
                readOnly
                value={created.url}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
            <p role="status" className="flex items-start gap-2 text-base text-muted-foreground">
              {created.emailed ? (
                <>
                  <MailIcon aria-hidden="true" className="mt-1 size-4 shrink-0" />
                  <span>We also emailed this link to {sentTo}.</span>
                </>
              ) : (
                <span>Send this link to the person you want to invite. It is shown only once.</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              Expires {formatFullDate(created.expires_at)}.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>
                Create another link
              </Button>
              <CopyButton value={created.url} label="Copy link" />
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Their email (optional)</Label>
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="blake@example.com"
                aria-describedby="invite-email-hint"
              />
              <p id="invite-email-hint" className="text-sm text-muted-foreground">
                If you add it, Orbit emails them the link and the invitation waits for them under
                Pending spaces. Otherwise you send the link yourself.
              </p>
            </div>
            <ErrorNotice message={error} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
