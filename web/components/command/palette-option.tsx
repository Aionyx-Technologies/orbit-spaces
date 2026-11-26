import {
  LayoutGridIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  OrbitIcon,
  PlugZapIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react";

import type { PaletteOptionProps } from "@/components/command/command-palette.types";
import type { CommandIcon } from "@/lib/command-search.types";
import { cn } from "@/lib/utils";

const ICONS: Readonly<Record<CommandIcon, LucideIcon>> = {
  space: OrbitIcon,
  mail: MailIcon,
  plus: PlusIcon,
  plug: PlugZapIcon,
  settings: SettingsIcon,
  grid: LayoutGridIcon,
  sun: SunIcon,
  moon: MoonIcon,
  monitor: MonitorIcon,
};

export function PaletteOption({ id, item, active, onActivate, onChoose }: PaletteOptionProps) {
  const Icon = ICONS[item.icon];
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onPointerMove={onActivate}
      onClick={onChoose}
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem]",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border bg-surface-2 text-muted-foreground",
          item.group === "Pending" && "border-ember/50 bg-ember-soft text-ember-text",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.label}</span>
        {item.description ? (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
    </div>
  );
}
