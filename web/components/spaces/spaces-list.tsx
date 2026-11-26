import { useId } from "react";

import { SpaceCard } from "@/components/spaces/space-card";
import { SpaceRow } from "@/components/spaces/space-row";
import type { SpacesListProps } from "@/components/spaces/spaces-list.types";
import { layoutClass } from "@/lib/space-layout";
import { cn } from "@/lib/utils";

export function SpacesList({ spaces, layout, heading, headingVisible }: SpacesListProps) {
  const headingId = useId();
  const Item = layout === "grid" ? SpaceCard : SpaceRow;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className={cn(headingVisible ? "heading-section" : "sr-only")}>
        {heading}
      </h2>
      <ul aria-labelledby={headingId} className={layoutClass(layout)}>
        {spaces.map((space, index) => (
          <li key={space.id}>
            <Item space={space} index={index} />
          </li>
        ))}
      </ul>
    </section>
  );
}
