import type { MainNavItem } from "@/lib/main-nav.types";
import { cn } from "@/lib/utils";

export const MAIN_NAV: readonly MainNavItem[] = [
  { section: "spaces", href: "/spaces", label: "Spaces" },
  { section: "assistants", href: "/assistants", label: "Assistants" },
];

export function navItemClass(active: boolean, interactive: boolean): string {
  return cn(
    "rounded-full px-1.5 py-2 text-sm font-medium text-muted-foreground min-[400px]:px-2 sm:px-3.5 sm:text-[0.9375rem]",
    interactive && "hover:bg-accent hover:text-foreground motion-safe:transition-colors",
    active && "bg-accent text-foreground",
  );
}
