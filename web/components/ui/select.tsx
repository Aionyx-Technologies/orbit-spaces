import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-11 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card pr-10 pl-3.5 text-base text-foreground shadow-[inset_0_1px_2px_var(--shadow-soft)] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive motion-safe:transition-[border-color,box-shadow]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
