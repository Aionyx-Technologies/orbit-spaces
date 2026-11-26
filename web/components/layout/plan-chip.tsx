"use client";

import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { BillingActions } from "@/components/billing/billing-actions";
import { UsageMeters } from "@/components/billing/usage-meters";
import { ErrorNotice } from "@/components/common/error-notice";
import type { PlanChipProps } from "@/components/layout/plan-chip.types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError, ME_KEY } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { currentPath } from "@/lib/navigation";
import { useBilling, useLiveMe } from "@/lib/queries";
import { useBillingReturn } from "@/lib/use-billing-return";
import { cn } from "@/lib/utils";

export function PlanChip({ me }: PlanChipProps) {
  useBillingReturn(me.billing_enabled);
  const live = useLiveMe(me);
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { data: billing, error: billingError } = useBilling(open && me.billing_enabled);

  if (!me.billing_enabled) {
    return null;
  }

  const isPlus = live.plan === "plus";
  const label = isPlus ? "Plus" : "Free";
  const when =
    isPlus && billing?.period_end
      ? `${billing.cancel_at_period_end ? "Ends on" : "Renews on"} ${formatDay(billing.period_end)}`
      : null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Numbers are never older than the last time the chip was opened.
      void mutate(ME_KEY);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isPlus ? "Plan: Plus" : "Plan: Free. Open for usage and upgrade options"}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium motion-safe:transition-colors max-[480px]:px-2.5",
            isPlus
              ? "border-transparent bg-accent text-primary hover:bg-accent/80"
              : "border-line-strong text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          {/* Below 480px only the icon shows, so the header keeps its room on a phone. */}
          <span className="max-[480px]:sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Your plan and usage">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-base font-semibold">{label} plan</p>
            {when ? <p className="text-sm text-muted-foreground">{when}</p> : null}
          </div>
          <UsageMeters
            aiUses={live.ai_uses}
            instantEmails={live.instant_emails}
            aiPackCredits={billing?.ai_pack_credits}
            emailPackCredits={billing?.email_pack_credits}
          />
          <ErrorNotice message={billingError ? describeError(billingError) : null} />
          {!billing && !billingError ? <Skeleton className="h-16 w-full" /> : null}
          {billing ? <BillingActions billing={billing} returnTo={currentPath()} /> : null}
          <Link
            href="/settings"
            className="text-sm underline underline-offset-4 hover:text-foreground"
          >
            Billing in Settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
