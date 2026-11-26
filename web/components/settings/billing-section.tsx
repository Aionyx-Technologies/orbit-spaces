"use client";

import { BillingActions } from "@/components/billing/billing-actions";
import { UsageMeters } from "@/components/billing/usage-meters";
import { ErrorNotice } from "@/components/common/error-notice";
import type { BillingSectionProps } from "@/components/settings/billing-section.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useBilling, useLiveMe } from "@/lib/queries";

export function BillingSection({ me }: BillingSectionProps) {
  const { data: billing, error: loadError } = useBilling(me.billing_enabled);
  const live = useLiveMe(me);
  if (!me.billing_enabled) {
    return null;
  }

  const isPlus = billing?.plan === "plus";
  const when =
    isPlus && billing?.period_end
      ? `${billing.cancel_at_period_end ? "Ends on" : "Renews on"} ${formatDay(billing.period_end)}`
      : null;

  return (
    <Card aria-labelledby="billing-title" aria-busy={!billing && !loadError} role="region">
      <CardHeader>
        <CardTitle id="billing-title">Billing</CardTitle>
        <CardDescription>
          Your plan and what you have left. Plus is $6 a month or $60 a year.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorNotice message={loadError ? describeError(loadError) : null} />
        {!billing && !loadError ? <Skeleton className="h-16 w-full" /> : null}
        {billing ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">Plan: {isPlus ? "Plus" : "Free"}</p>
              {when ? <p className="text-sm text-muted-foreground">{when}</p> : null}
            </div>
            <UsageMeters
              aiUses={live.ai_uses}
              instantEmails={live.instant_emails}
              aiPackCredits={billing.ai_pack_credits}
              emailPackCredits={billing.email_pack_credits}
            />
            <BillingActions billing={billing} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
