import { ArrowUpDownIcon } from "lucide-react";

import type { SpacesSortProps } from "@/components/spaces/spaces-toolbar.types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPACE_SORTS } from "@/lib/space-filters";
import type { SpaceSort } from "@/lib/space-filters.types";

export const SORT_LABELS: Readonly<Record<SpaceSort, string>> = {
  activity: "Recent activity",
  name: "Name",
  created: "Date created",
};

export function SpacesSort({ value, onChange }: SpacesSortProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-10 rounded-full px-4">
          <ArrowUpDownIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{SORT_LABELS[value]}</span>
          <span className="sr-only">Sort spaces</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) =>
            onChange(SPACE_SORTS.find((sort) => sort === next) ?? "activity")
          }
        >
          {SPACE_SORTS.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
