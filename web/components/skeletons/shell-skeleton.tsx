import { Logo } from "@/components/brand/logo";
import type { ShellSkeletonProps } from "@/components/skeletons/shell-skeleton.types";
import { Skeleton } from "@/components/ui/skeleton";
import { MAIN_NAV, navItemClass } from "@/lib/main-nav";
import { contentWidth, headerWidth, LOGO_LINK_CLASS } from "@/lib/shell";
import { cn } from "@/lib/utils";

export function ShellSkeleton({ width = "wide", current = null, children }: ShellSkeletonProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b glass">
        <div
          className={cn(
            "mx-auto flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6",
            headerWidth(),
          )}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-5">
            <span className={LOGO_LINK_CLASS}>
              <Logo wordmarkClassName="max-sm:sr-only" />
            </span>
            <div aria-hidden="true" className="flex items-center gap-1">
              {MAIN_NAV.map((item) => (
                <span key={item.section} className={navItemClass(current === item.section, false)}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Skeleton className="h-10 w-11.5 rounded-full sm:w-60 lg:w-72" />
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="ml-0.5 size-9 rounded-full" />
          </div>
        </div>
      </header>
      <main
        id="main"
        aria-busy="true"
        className={cn("mx-auto w-full px-4 py-8 sm:px-6 sm:py-12", contentWidth(width))}
      >
        <p role="status" className="sr-only">
          Loading…
        </p>
        {children}
      </main>
    </>
  );
}
