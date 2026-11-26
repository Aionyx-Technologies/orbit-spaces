import Link from "next/link";

import type { PolicyLinksProps } from "@/components/legal/policy-links.types";
import { POLICY_LINKS } from "@/lib/legal";
import { cn } from "@/lib/utils";

export function PolicyLinks({ className }: PolicyLinksProps) {
  return (
    <nav
      aria-label="Policies"
      className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground", className)}
    >
      {POLICY_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="py-2 underline underline-offset-4 hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
