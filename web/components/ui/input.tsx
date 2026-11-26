import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-base text-foreground shadow-[inset_0_1px_2px_var(--shadow-soft)] placeholder:text-muted-foreground read-only:bg-muted focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive motion-safe:transition-[border-color,box-shadow]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
