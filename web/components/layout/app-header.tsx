import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CommandPalette } from "@/components/command/command-palette";
import type { AppHeaderProps } from "@/components/layout/app-header.types";
import { PlanChip } from "@/components/layout/plan-chip";
import { SettingsLink } from "@/components/layout/settings-link";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { MAIN_NAV, navItemClass } from "@/lib/main-nav";
import { headerWidth, LOGO_LINK_CLASS } from "@/lib/shell";
import { cn } from "@/lib/utils";

export function AppHeader({ me, current }: AppHeaderProps) {
  // The chip needs the plan numbers; a page that does not pass them, or a server without
  // billing, shows no chip.
  const plan =
    me.billing_enabled && me.plan !== undefined && me.ai_uses !== undefined
      ? {
          plan: me.plan,
          billing_enabled: true,
          ai_uses: me.ai_uses,
          instant_emails: me.instant_emails ?? null,
        }
      : null;
  return (
    <header className="sticky top-0 z-30 border-b glass">
      <div
        className={cn(
          "mx-auto flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6",
          headerWidth(),
        )}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <Link href="/spaces" aria-label="Orbit, go to your spaces" className={LOGO_LINK_CLASS}>
            <Logo wordmarkClassName="max-sm:sr-only" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.section}
                href={item.href}
                aria-current={current === item.section ? "page" : undefined}
                className={navItemClass(current === item.section, true)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <CommandPalette />
          <ThemeSwitcher />
          {plan ? <PlanChip me={plan} /> : null}
          <SettingsLink
            name={me.display_name}
            avatarUrl={me.avatar_url}
            selected={current === "settings"}
          />
        </div>
      </div>
    </header>
  );
}
