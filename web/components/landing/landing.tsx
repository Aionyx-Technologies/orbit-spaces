import { ArrowDownIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { DemoSignIn } from "@/components/landing/demo-sign-in";
import { HeroOrbit } from "@/components/landing/hero-orbit";
import { HeroSetupPrompt } from "@/components/landing/hero-setup-prompt";
import { HowItWorks } from "@/components/landing/how-it-works";
import type { LandingProps } from "@/components/landing/landing.types";
import { CompanyNotice } from "@/components/legal/company-notice";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { POLICY_LINKS, SOURCE_URL } from "@/lib/legal";

const ASSISTANTS = [
  "ChatGPT",
  "Claude",
  "Grok",
  "Muse",
  "OpenClaw",
  "Hermes Agent",
  "Wabi",
] as const;

const FOOTER_LINKS = [
  { href: "/setup", label: "Setup guide" },
  ...POLICY_LINKS,
  { href: SOURCE_URL, label: "Source code" },
] as const;

export function Landing({ demo, mcpUrl, billingEnabled = false }: LandingProps) {
  return (
    <>
      <main id="main" className="w-full">
        <section
          aria-labelledby="landing-title"
          className="relative isolate mx-auto flex min-h-[92dvh] w-full flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
        >
          <HeroOrbit className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_540px_460px_at_50%_50%,transparent_62%,black_100%),linear-gradient(to_bottom,black_70%,transparent)] [mask-composite:intersect]" />
          <div className="absolute top-4 right-4">
            <ThemeSwitcher />
          </div>
          <div className="flex w-full max-w-2xl flex-col items-center gap-8">
            <Logo className="text-2xl" markClassName="size-9" />
            <div className="flex flex-col gap-5">
              <h1 id="landing-title" className="text-display">
                Work together across <em className="text-primary not-italic">AI assistants</em>
              </h1>
              <p className="mx-auto max-w-xl text-lg text-pretty text-muted-foreground">
                Invite anyone into a space, whichever assistant they use, or none at all. Everyone
                shares only what they choose, and each assistant reads only what is in the space.
              </p>
            </div>
            {mcpUrl ? <HeroSetupPrompt mcpUrl={mcpUrl} assistants={ASSISTANTS} /> : null}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="/auth/sign-in?next=/spaces"
                className={buttonVariants({ size: "lg", variant: mcpUrl ? "outline" : "default" })}
              >
                Sign in
              </a>
              <a href="#how-it-works" className={buttonVariants({ size: "lg", variant: "ghost" })}>
                See how it works
                <ArrowDownIcon aria-hidden="true" />
              </a>
            </div>
            <ul aria-label="Works with" className="sr-only">
              {ASSISTANTS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {demo?.enabled ? <DemoSignIn people={demo.people} /> : null}
          </div>
        </section>
        <HowItWorks billingEnabled={billingEnabled} />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 text-sm text-muted-foreground">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <Logo className="text-base text-foreground" markClassName="size-6" />
            <nav aria-label="More from Orbit">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <CompanyNotice className="border-t pt-6" />
        </div>
      </footer>
    </>
  );
}
