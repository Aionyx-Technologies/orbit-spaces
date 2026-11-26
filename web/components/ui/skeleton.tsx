import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted bg-[linear-gradient(100deg,transparent_30%,color-mix(in_oklab,var(--foreground)_7%,transparent)_50%,transparent_70%)] bg-[length:200%_100%] motion-safe:animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
