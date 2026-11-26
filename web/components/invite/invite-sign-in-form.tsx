"use client";

import { MailCheckIcon } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import { ErrorNotice } from "@/components/common/error-notice";
import type {
  InviteSignInFormProps,
  SignInStage,
} from "@/components/invite/invite-sign-in-form.types";
import { WaitlistForm } from "@/components/invite/waitlist-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, describeError } from "@/lib/api";

export function InviteSignInForm({ token }: InviteSignInFormProps) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<SignInStage>({ stage: "form" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await api.auth.signIn({
        email,
        next: `/invite/${encodeURIComponent(token)}`,
        invite: token,
      });
      setStage(
        result.status === "sent"
          ? { stage: "sent", email: email.trim() }
          : { stage: "private", email: email.trim() },
      );
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setPending(false);
    }
  }

  if (stage.stage === "private") {
    return <WaitlistForm initialEmail={stage.email} />;
  }

  if (stage.stage === "sent") {
    return (
      <div role="status" className="grid gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <MailCheckIcon aria-hidden="true" className="size-6" />
        </div>
        <div className="grid gap-2">
          <h2 className="heading-section">Check your email</h2>
          <p className="text-base text-muted-foreground">
            We sent a sign-in link to {stage.email}. Open it in this browser and you will come back
            here to accept the invite.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="-ml-3 self-start"
          onClick={() => setStage({ stage: "form" })}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-sign-in-email">Email</Label>
        <Input
          id="invite-sign-in-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          aria-describedby="invite-sign-in-hint"
          required
        />
        <p id="invite-sign-in-hint" className="text-sm text-muted-foreground">
          We email you a link. No password and nothing to install.
        </p>
      </div>
      <ErrorNotice message={error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}
