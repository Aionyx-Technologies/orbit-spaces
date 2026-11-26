"use client";

import { useId } from "react";

import { PendingCard } from "@/components/spaces/pending-card";
import type { PendingSectionProps } from "@/components/spaces/pending-section.types";
import { Badge } from "@/components/ui/badge";
import { layoutClass } from "@/lib/space-layout";

export function PendingSection({ invitations, layout, onAccept, onDecline }: PendingSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="heading-section">
          Pending spaces
        </h2>
        <Badge variant="ember">{invitations.length}</Badge>
        <p className="basis-full text-sm text-muted-foreground">
          People invited you to these. Join to see what is inside.
        </p>
      </div>
      <ul aria-labelledby={headingId} className={layoutClass(layout)}>
        {invitations.map((invitation, index) => (
          <li key={invitation.id}>
            <PendingCard
              invitation={invitation}
              index={index}
              compact={layout === "list"}
              onAccept={onAccept}
              onDecline={onDecline}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
