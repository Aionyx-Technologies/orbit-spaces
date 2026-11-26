"use client";

import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { BillingActionsProps } from "@/components/billing/billing-actions.types";
import { ErrorNotice } from "@/components/common/error-notice";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api";
import type { BillingProduct } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { navigateTo } from "@/lib/navigation";

type Target = BillingProduct | "portal";

// Kept in step with the Plus card on the landing page and the limits in api/orbit/plans.py.
const PLUS_BENEFITS = [
  "Unlimited spaces",
  "Up to 25 people in each space",
  "150 AI uses a month",
  "100 instant update emails a day",
] as const;

export function BillingActions({ billing, returnTo }: BillingActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Coming back from Stripe with the Back button restores this page as it was left, with
    // the buttons still waiting on a navigation that is over.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setPending(false);
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function leaveFor(target: Target) {
    setPending(true);
    setError(null);
    try {
      const { url } = await (target === "portal"
        ? api.billing.portal(returnTo)
        : api.billing.checkout(target, returnTo));
      navigateTo(url);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
      setPending(false);
    }
  }

  const isPlus = billing.plan === "plus";

  return (
    <div className="flex flex-col gap-3">
      <ErrorNotice message={error} />
      {isPlus ? null : (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">What Plus adds</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {PLUS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {isPlus ? null : (
          <>
            <Button type="button" disabled={pending} onClick={() => void leaveFor("plus_monthly")}>
              Upgrade to Plus, $6 a month
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void leaveFor("plus_yearly")}
            >
              Upgrade to Plus, $60 a year
            </Button>
          </>
        )}
        {billing.ai_pack_available ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void leaveFor("ai_pack")}
          >
            Buy 100 AI uses
          </Button>
        ) : null}
        {billing.email_pack_available ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void leaveFor("email_pack")}
          >
            Buy 500 emails
          </Button>
        ) : null}
        {billing.can_manage ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void leaveFor("portal")}
          >
            Manage subscription
          </Button>
        ) : null}
      </div>
      {isPlus ? null : (
        <p className="text-sm text-muted-foreground">The yearly plan is 2 months free.</p>
      )}
    </div>
  );
}
