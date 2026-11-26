import type { CompanyNoticeProps } from "@/components/legal/company-notice.types";
import { COMPANY } from "@/lib/legal";
import { cn } from "@/lib/utils";

export function CompanyNotice({ className }: CompanyNoticeProps) {
  return (
    <div className={cn("flex flex-col gap-1 text-sm text-muted-foreground", className)}>
      <p className="text-pretty">
        Orbit is a product of {COMPANY.name}, {COMPANY.description}.{" "}
        <a
          href={`mailto:${COMPANY.email}`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          {COMPANY.email}
        </a>
      </p>
      <p>
        © {new Date().getFullYear()} {COMPANY.name} All rights reserved.
      </p>
    </div>
  );
}
