import type { Billing } from "@/lib/api.types";

export type BillingActionsProps = Readonly<{
  billing: Billing;
  // A page on this site to come back to after Stripe; the server checks it.
  returnTo?: string;
}>;
