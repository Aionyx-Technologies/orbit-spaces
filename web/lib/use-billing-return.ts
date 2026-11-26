import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import { api, BILLING_KEY, ME_KEY } from "@/lib/api";
import type { Billing } from "@/lib/api.types";

// Stripe tells Orbit about a purchase a few seconds after the person comes back, sometimes more.
const REFRESHES_AFTER_CHECKOUT_MS = [3000, 8000, 15000];

const MESSAGES = {
  success: "Thanks, your purchase is being processed. It can take a moment to show up.",
  cancelled: "Checkout cancelled. You have not been charged.",
} as const;

type Outcome = keyof typeof MESSAGES;

// What a purchase changes: the plan or a pack balance.
function purchaseKey(billing: Billing): string {
  return [billing.plan, billing.ai_pack_credits, billing.email_pack_credits].join("|");
}

function readOutcome(): Outcome | null {
  const value = new URLSearchParams(window.location.search).get("billing");
  return value === "success" || value === "cancelled" ? value : null;
}

/*
 * Handles the person coming back from Stripe, on whatever page they started from: one message,
 * the address cleaned, and for a purchase a few refreshes of the plan and usage until it shows.
 * Mount it once.
 */
export function useBillingReturn(enabled: boolean): void {
  const { mutate } = useSWRConfig();
  const [bought, setBought] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const outcome = readOutcome();
    if (outcome === null) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (outcome === "success") {
      toast.success(MESSAGES.success);
      // The address bar is only readable in the browser, so this cannot be the initial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBought(true);
    } else {
      toast(MESSAGES.cancelled);
    }
  }, [enabled]);

  useEffect(() => {
    if (!bought) {
      return;
    }
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function refresh(): Promise<Billing | null> {
      try {
        const [billing, me] = await Promise.all([api.billing.get(), api.me.get()]);
        await mutate(BILLING_KEY, billing, { revalidate: false });
        await mutate(ME_KEY, me, { revalidate: false });
        return billing;
      } catch {
        return null;
      }
    }

    void (async () => {
      const first = await refresh();
      if (done) {
        return;
      }
      const before = first ? purchaseKey(first) : null;
      for (const delay of REFRESHES_AFTER_CHECKOUT_MS) {
        timers.push(
          setTimeout(() => {
            if (done) {
              return;
            }
            void refresh().then((fresh) => {
              if (fresh && before !== null && purchaseKey(fresh) !== before) {
                done = true;
                timers.forEach(clearTimeout);
              }
            });
          }, delay),
        );
      }
    })();

    return () => {
      done = true;
      timers.forEach(clearTimeout);
    };
  }, [bought, mutate]);
}
