"use client";

import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { HighlightChips } from "@/components/spaces/highlight-chips";
import { NewBadge } from "@/components/spaces/new-badge";
import { OwnerBadge } from "@/components/spaces/owner-badge";
import { SourceBadges } from "@/components/spaces/source-badges";
import { SpaceActivity } from "@/components/spaces/space-activity";
import { SpaceCover } from "@/components/spaces/space-cover";
import type { SpaceCardProps } from "@/components/spaces/space-card.types";
import { Badge } from "@/components/ui/badge";
import { buildCoverArt } from "@/lib/cover-art";
import { cssVars } from "@/lib/css-vars";
import { plural } from "@/lib/format";
import { ownerIdOf } from "@/lib/members";
import { trackPointer } from "@/lib/spotlight";

export function SpaceCard({ space, index = 0 }: SpaceCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-slot="space-card"
      onPointerMove={trackPointer}
      style={cssVars({ "--i": index })}
      className="tilt-card spotlight group relative isolate flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-card hover:border-line-strong hover:shadow-lift has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ring motion-safe:animate-rise motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-300 motion-safe:[animation-delay:calc(min(var(--i,0),8)*55ms)] motion-safe:hover:-translate-y-0.5"
    >
      <div className="relative aspect-[16/10] border-b border-border">
        <SpaceCover art={buildCoverArt(space)} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <OwnerBadge space={space} />
          <div className="flex shrink-0 items-center gap-1.5">
            <NewBadge count={space.new_count} />
            {space.has_plan ? (
              <Badge variant="glass">
                <SparklesIcon aria-hidden="true" className="text-primary" />
                Plan
              </Badge>
            ) : null}
          </div>
        </div>
        <HighlightChips
          space={space}
          className="pointer-events-none absolute inset-x-3 bottom-3 max-h-[4.25rem] overflow-hidden"
        />
      </div>
      <div className="relative z-10 flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 id={titleId} className="truncate heading-card">
            <Link
              href={`/spaces/${space.id}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {space.name}
            </Link>
          </h3>
          <SpaceActivity space={space} className="mt-0.5" />
        </div>
        <div className="mt-auto flex items-center gap-3">
          <AvatarStack
            members={space.members}
            ownerId={ownerIdOf(space)}
            className="relative z-10"
          />
          <span className="text-xs text-muted-foreground">
            {plural(space.members.length, "person", "people")}
          </span>
          <SourceBadges sources={space.sources} className="ml-auto" />
        </div>
      </div>
    </article>
  );
}
