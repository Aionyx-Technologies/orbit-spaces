import { ScreenCache } from "@/components/common/screen-cache";
import { AppHeader } from "@/components/layout/app-header";
import type { AppShellProps } from "@/components/layout/app-shell.types";
import { contentWidth } from "@/lib/shell";
import { cn } from "@/lib/utils";

export function AppShell({ me, current, width = "wide", children }: AppShellProps) {
  return (
    // One cache for the header and the page, so the plan chip and the screen's own cards see the
    // same refreshed data (for example after coming back from Stripe).
    <ScreenCache>
      <AppHeader me={me} current={current} />
      <main
        id="main"
        className={cn("mx-auto w-full px-4 py-8 sm:px-6 sm:py-12", contentWidth(width))}
      >
        {children}
      </main>
    </ScreenCache>
  );
}
