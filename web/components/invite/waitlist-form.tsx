"use client";

import { useState, type SubmitEvent } from "react";

import { ErrorNotice } from "@/components/common/error-notice";
import type { WaitlistFormProps } from "@/components/invite/waitlist-form.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, describeError } from "@/lib/api";

export function WaitlistForm({ initialEmail }: WaitlistFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [joinedEmail, setJoinedEmail] = useState<string | null>(null);
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
      await api.auth.waitlist(email);
      setJoinedEmail(email.trim());
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setPending(false);
    }
  }

  if (joinedEmail) {
    return (
      <div role="status" className="grid gap-2">
        <h2 className="heading-section">You are on the list</h2>
        <p className="text-base text-muted-foreground">
          Thanks. We will email {joinedEmail} as soon as a space opens up for you.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h2 className="heading-section">Orbit is in a small orbit for now</h2>
        <p className="text-base text-muted-foreground">
          We are bringing people in a few at a time. Leave your email and we will let you know as
          soon as a space opens up for you.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="waitlist-email">Email</Label>
          <Input
            id="waitlist-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <ErrorNotice message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
      </form>
    </div>
  );
}
