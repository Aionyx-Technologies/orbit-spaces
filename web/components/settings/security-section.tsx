"use client";

import { LogOutIcon, MonitorOffIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorNotice } from "@/components/common/error-notice";
import type { SecuritySectionProps } from "@/components/settings/security-section.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError, signInUrl } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { describeLastSignIn } from "@/lib/last-sign-in";
import { navigateTo } from "@/lib/navigation";

export function SecuritySection({ me }: SecuritySectionProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [endingAll, setEndingAll] = useState(false);
  const [endAllError, setEndAllError] = useState<string | null>(null);
  const lastSignIn = me.last_sign_in ? describeLastSignIn(me.last_sign_in, me.time_zone) : null;

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      await api.auth.signOut();
      navigateTo("/");
    } catch (failure) {
      setError(describeError(failure));
      setSigningOut(false);
    }
  }

  async function signOutEverywhere() {
    setEndingAll(true);
    setEndAllError(null);
    try {
      await api.me.signOutEverywhere();
      navigateTo(signInUrl("/settings"));
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setEndAllError(describeError(failure));
      }
      setEndingAll(false);
    }
  }

  return (
    <Card aria-labelledby="security-title" role="region">
      <CardHeader>
        <CardTitle id="security-title">Security</CardTitle>
        <CardDescription>Sign out of Orbit here, or on every browser at once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lastSignIn ? <p className="text-base text-muted-foreground">{lastSignIn}</p> : null}
        <ErrorNotice message={error} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <LogOutIcon aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            <MonitorOffIcon aria-hidden="true" />
            Sign out everywhere
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Signing out everywhere ends every web session, including this one. Connected assistants
          are not affected. You can manage them on the{" "}
          <Link
            href="/assistants"
            className="font-medium text-primary underline underline-offset-4"
          >
            Assistants tab
          </Link>
          .
        </p>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) {
            setEndAllError(null);
          }
        }}
        title="Sign out everywhere?"
        description="You will be signed out on every browser and device, including this one, and will need to sign in again. Assistants you have connected stay connected."
        confirmLabel="Sign out everywhere"
        pendingLabel="Signing out…"
        pending={endingAll}
        error={endAllError}
        onConfirm={signOutEverywhere}
      />
    </Card>
  );
}
