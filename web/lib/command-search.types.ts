import type { ThemeChoice } from "@/lib/theme.types";

export type CommandAction =
  Readonly<{ type: "navigate"; href: string }> | Readonly<{ type: "theme"; choice: ThemeChoice }>;

export type CommandGroup = "Pending" | "Spaces" | "Actions";

export type CommandIcon =
  "space" | "mail" | "plus" | "plug" | "settings" | "grid" | "sun" | "moon" | "monitor";

export type CommandItem = Readonly<{
  id: string;
  group: CommandGroup;
  label: string;
  description?: string;
  keywords: readonly string[];
  icon: CommandIcon;
  action: CommandAction;
}>;

export type CommandSection = Readonly<{
  group: CommandGroup;
  items: readonly CommandItem[];
}>;
