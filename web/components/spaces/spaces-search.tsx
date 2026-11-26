import { SearchIcon, XIcon } from "lucide-react";

import type { SpacesSearchProps } from "@/components/spaces/spaces-toolbar.types";
import { Input } from "@/components/ui/input";

export function SpacesSearch({ value, onChange }: SpacesSearchProps) {
  return (
    <div role="search" className="relative min-w-0 flex-1 sm:flex-none">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Search spaces"
        placeholder="Search spaces"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-full pr-10 pl-10 sm:w-56 sm:focus:w-72 motion-safe:sm:transition-[width,border-color,box-shadow] [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
