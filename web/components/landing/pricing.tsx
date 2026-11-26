import { CheckIcon } from "lucide-react";

import type { PricingProps } from "@/components/landing/pricing.types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Plan = Readonly<{
  name: string;
  price: string;
  cadence: string;
  also: string;
  blurb: string;
  // The one thing to do on this card; null means the plan is not open yet.
  action: Readonly<{ label: string; href: string; needsBilling: boolean }> | null;
  note?: string;
  lead?: string;
  features: readonly string[];
}>;

const PLANS: readonly Plan[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "per month",
    also: "No card needed",
    blurb: "For planning a trip or a dinner with friends and family.",
    action: { label: "Start free", href: "/auth/sign-in?next=/spaces", needsBilling: false },
    features: [
      "5 spaces you own, join as many as you like",
      "Up to 10 people in each space",
      "20 AI uses a month",
      "20 instant update emails a day",
      "Works with ChatGPT, Claude, Grok and more, or on the web",
    ],
  },
  {
    name: "Plus",
    price: "$6",
    cadence: "per month",
    also: "or $60 a year, 2 months free",
    blurb: "For the person who organizes everything.",
    action: { label: "Get Plus", href: "/auth/sign-in?next=/settings", needsBilling: true },
    note: "Cancel any time.",
    lead: "Everything in Free, plus:",
    features: [
      "Unlimited spaces",
      "Up to 25 people in each space",
      "150 AI uses a month",
      "100 instant update emails a day",
    ],
  },
  {
    name: "Team",
    price: "$10",
    cadence: "per member per month",
    also: "or $100 per member a year, 2 months free",
    blurb: "For teams and client projects.",
    action: null,
    lead: "Everything in Plus, plus:",
    features: [
      "Up to 100 people in each space",
      "250 AI uses a month per member, shared by the team",
      "250 instant update emails a day per member",
      "Invite clients and guests free",
      "One bill, admin controls, priority support",
    ],
  },
];

const SELF_HOSTED_FEATURES: readonly string[] = [
  "Every collaboration feature",
  "Bring your own AI key",
  "Bring your own email provider",
  "You handle hosting, updates and backups",
];

type AddOn = Readonly<{
  name: string;
  amount: string;
  price: string;
  explainer: string;
}>;

const ADD_ONS: readonly AddOn[] = [
  {
    name: "Extra AI",
    amount: "100 AI uses",
    price: "$5",
    explainer:
      "One AI use is one press of Combine, or one space set up from a sentence. Extra uses last 12 months.",
  },
  {
    name: "Extra emails",
    amount: "500 instant update emails",
    price: "$3",
    explainer:
      "An instant update email arrives as soon as something new is shared. Past your daily allowance, updates wait for the morning summary; extras keep them instant. They last 12 months.",
  },
];

function Check({ children }: Readonly<{ children: string }>) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="text-pretty">{children}</span>
    </li>
  );
}

export function Pricing({ billingEnabled = false }: PricingProps) {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 pb-24 sm:pb-32"
    >
      <header className="flex max-w-2xl flex-col gap-4">
        <h2
          id="pricing-title"
          className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-5xl"
        >
          Simple pricing
        </h2>
        <p className="text-lg text-pretty text-muted-foreground">
          Joining a space is always free. The person who organizes it is the one who pays
          {billingEnabled ? "." : ", once paid plans arrive."}
        </p>
      </header>

      <ul className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const open = plan.action !== null && (!plan.action.needsBilling || billingEnabled);
          const featured = open && plan.name === "Plus";
          return (
            <li
              key={plan.name}
              className={cn(
                "flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-card sm:p-8",
                featured && "border-primary bg-accent/40 shadow-lift",
                !open && "border-dashed",
              )}
            >
              <div className="flex flex-col gap-4">
                <h3 className="heading-section">{plan.name}</h3>
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-5xl font-semibold tracking-[-0.03em] tabular-nums">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">{plan.cadence}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{plan.also}</p>
                </div>
                <p className="text-pretty text-muted-foreground lg:min-h-12">{plan.blurb}</p>
              </div>

              {/* Room for the note on every card, so the feature lists start level. */}
              <div className="flex flex-col gap-2 lg:min-h-[4.75rem]">
                {open && plan.action ? (
                  <a
                    href={plan.action.href}
                    className={cn(
                      buttonVariants({ size: "lg", variant: featured ? "default" : "outline" }),
                      "w-full",
                    )}
                  >
                    {plan.action.label}
                  </a>
                ) : (
                  <p className="grid h-12 w-full place-items-center rounded-md border border-dashed text-base font-medium text-muted-foreground">
                    Coming soon
                  </p>
                )}
                {plan.note && open ? (
                  <p className="text-center text-sm text-muted-foreground">{plan.note}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 border-t pt-6">
                {plan.lead ? <p className="text-sm font-medium">{plan.lead}</p> : null}
                <ul className="flex flex-col gap-3 text-[0.9375rem]">
                  {plan.features.map((feature) => (
                    <Check key={feature}>{feature}</Check>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">
        Past the daily limit, update emails wait for the morning summary.
      </p>

      <div
        role="group"
        aria-labelledby="pricing-self-hosted"
        className="mt-4 flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-card sm:p-8 md:flex-row md:items-center md:justify-between md:gap-12"
      >
        <div className="flex flex-col gap-1">
          <h3 id="pricing-self-hosted" className="heading-section">
            Self-hosted
          </h3>
          <p className="font-medium">Free, open source</p>
          <p className="text-pretty text-muted-foreground">
            For people who want to run Orbit on their own server.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5 text-[0.9375rem] md:max-w-sm">
          {SELF_HOSTED_FEATURES.map((feature) => (
            <Check key={feature}>{feature}</Check>
          ))}
        </ul>
      </div>

      {billingEnabled ? (
        <div className="mt-16 flex flex-col gap-6">
          <div className="flex max-w-2xl flex-col gap-1.5">
            <h3 className="heading-section">Top up any time</h3>
            <p className="text-pretty text-muted-foreground">
              Run out before the month ends? Buy more, with no change of plan.
            </p>
          </div>
          <ul className="grid gap-6 md:grid-cols-2">
            {ADD_ONS.map((addOn) => (
              <li
                key={addOn.name}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-card sm:p-8"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-lg font-semibold">{addOn.name}</h4>
                    <p className="font-medium">{addOn.amount}</p>
                  </div>
                  <p className="flex flex-col items-end">
                    <span className="text-3xl font-semibold tracking-[-0.02em] tabular-nums">
                      {addOn.price}
                    </span>
                    <span className="text-sm text-muted-foreground">one-time</span>
                  </p>
                </div>
                <p className="text-sm text-pretty text-muted-foreground">{addOn.explainer}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Buy add-ons from Settings once you are signed in.
          </p>
        </div>
      ) : null}
    </section>
  );
}
