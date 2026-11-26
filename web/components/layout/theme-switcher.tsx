"use client";

import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseTheme, THEME_CHOICES } from "@/lib/theme";
import type { ThemeChoice } from "@/lib/theme.types";
import { useTheme } from "@/lib/use-theme";

const OPTIONS: Readonly<Record<ThemeChoice, Readonly<{ label: string; Icon: LucideIcon }>>> = {
  system: { label: "System", Icon: MonitorIcon },
  light: { label: "Light", Icon: SunIcon },
  dark: { label: "Dark", Icon: MoonIcon },
};

export function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  const { Icon } = OPTIONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Theme" className="size-10">
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(next) => setTheme(parseTheme(next))}>
          {THEME_CHOICES.map((choice) => {
            const { label, Icon: ChoiceIcon } = OPTIONS[choice];
            return (
              <DropdownMenuRadioItem key={choice} value={choice}>
                <ChoiceIcon aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
