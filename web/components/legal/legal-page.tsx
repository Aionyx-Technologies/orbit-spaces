import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CompanyNotice } from "@/components/legal/company-notice";
import type { LegalPageProps } from "@/components/legal/legal-page.types";
import { PolicyLinks } from "@/components/legal/policy-links";

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14"
    >
      <Link href="/" aria-label="Orbit home" className="w-fit rounded-md">
        <Logo />
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="heading-page">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {updated}</p>
      </header>
      <div className="flex flex-col gap-8">{children}</div>
      <footer className="flex flex-col gap-4 border-t pt-6">
        <PolicyLinks />
        <CompanyNotice />
      </footer>
    </main>
  );
}
