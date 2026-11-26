import type { LogoMarkProps, LogoProps } from "@/components/brand/logo.types";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 text-primary", className)}
    >
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.8" />
      <circle cx="16" cy="16" r="4.1" fill="currentColor" />
      <g
        className="group-hover/logo:rotate-[60deg] motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out-expo"
        style={{ transformOrigin: "16px 16px" }}
      >
        <circle cx="25.12" cy="9.85" r="3.5" fill="var(--ember)" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn("group/logo inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn("text-[1.5em] leading-none font-semibold tracking-tight", wordmarkClassName)}
      >
        Orbit
      </span>
    </span>
  );
}
