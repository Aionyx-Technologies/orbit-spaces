import type { CommandItem } from "@/lib/command-search.types";

export type PaletteOptionProps = Readonly<{
  id: string;
  item: CommandItem;
  active: boolean;
  onActivate: () => void;
  onChoose: () => void;
}>;
