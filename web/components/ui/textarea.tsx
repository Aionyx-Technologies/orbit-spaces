import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 text-base text-foreground shadow-[inset_0_1px_2px_var(--shadow-soft)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive motion-safe:transition-[border-color,box-shadow]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
