"use client";

import { ChevronRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { NewBadge } from "@/components/spaces/new-badge";
import { OwnerBadge } from "@/components/spaces/owner-badge";
import { SourceBadges } from "@/components/spaces/source-badges";
import { SpaceActivity } from "@/components/spaces/space-activity";
import { SpaceCover } from "@/components/spaces/space-cover";
import type { SpaceCardProps } from "@/components/spaces/space-card.types";
import { buildCoverArt } from "@/lib/cover-art";
import { cssVars } from "@/lib/css-vars";
import { ownerIdOf } from "@/lib/members";
import { trackPointer } from "@/lib/spotlight";

export function SpaceRow({ space, index = 0 }: SpaceCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-slot="space-row"
      onPointerMove={trackPointer}
      style={cssVars({ "--i": index })}
      className="tilt-card spotlight group relative isolate flex items-center gap-4 overflow-hidden rounded-lg border bg-card p-3 pr-4 shadow-card hover:border-line-strong hover:shadow-lift has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ring motion-safe:animate-rise motion-safe:transition-[box-shadow,border-color] motion-safe:duration-300 motion-safe:[animation-delay:calc(min(var(--i,0),8)*40ms)]"
    >
      <SpaceCover
        art={buildCoverArt(space)}
        className="relative z-10 size-16 shrink-0 rounded-md border border-border sm:size-20"
      />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={titleId} className="truncate text-base leading-snug font-semibold tracking-tight">
            <Link
              href={`/spaces/${space.id}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {space.name}
            </Link>
          </h3>
          <NewBadge count={space.new_count} />
          <OwnerBadge space={space} className="hidden shrink-0 sm:inline-flex" />
          {space.has_plan ? (
            <SparklesIcon
              aria-label="Has a plan"
              role="img"
              className="hidden size-4 shrink-0 text-primary sm:block"
            />
          ) : null}
        </div>
        <SpaceActivity space={space} className="mt-0.5" />
        {space.highlights.length > 0 ? (
          <p className="mt-1 hidden truncate text-xs text-muted-foreground md:block">
            {space.highlights.map((highlight) => `${highlight.key} ${highlight.value}`).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="relative z-10 hidden items-center gap-4 sm:flex">
        <SourceBadges sources={space.sources} />
        <AvatarStack members={space.members} ownerId={ownerIdOf(space)} />
      </div>
      <ChevronRightIcon
        aria-hidden="true"
        className="relative z-10 size-5 shrink-0 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground motion-safe:transition-transform"
      />
    </article>
  );
}
