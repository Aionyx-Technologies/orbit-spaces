import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import type { BackLinkProps } from "@/components/common/back-link.types";

export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="group inline-flex w-fit items-center gap-1.5 rounded-full border bg-card/60 py-1.5 pr-3.5 pl-2.5 text-sm font-medium text-muted-foreground hover:text-foreground motion-safe:transition-colors"
    >
      <ArrowLeftIcon
        aria-hidden="true"
        className="size-4 group-hover:-translate-x-0.5 motion-safe:transition-transform"
      />
      {children}
    </Link>
  );
}
