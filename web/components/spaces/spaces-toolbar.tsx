import { LayoutToggle } from "@/components/spaces/layout-toggle";
import { SpacesSearch } from "@/components/spaces/spaces-search";
import { SpacesSort } from "@/components/spaces/spaces-sort";
import type { SpacesToolbarProps } from "@/components/spaces/spaces-toolbar.types";

export function SpacesToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  layout,
  onLayoutChange,
}: SpacesToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <SpacesSearch value={query} onChange={onQueryChange} />
      <SpacesSort value={sort} onChange={onSortChange} />
      <LayoutToggle value={layout} onChange={onLayoutChange} />
    </div>
  );
}
