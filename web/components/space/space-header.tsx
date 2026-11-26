import { UserPlusIcon } from "lucide-react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { BackLink } from "@/components/common/back-link";
import { RelativeTime } from "@/components/common/relative-time";
import { InviteDialog } from "@/components/space/invite-dialog";
import { SpaceMenu } from "@/components/space/space-menu";
import type { SpaceHeaderProps } from "@/components/space/space-header.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { ownerIdOf } from "@/lib/members";

export function SpaceHeader({ space, status, onTemplateSaved }: SpaceHeaderProps) {
  const description = space.template.description.trim();
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/spaces">Spaces</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
          <h1 title={space.name} className="heading-page break-words">
            {space.name}
          </h1>
          {description ? (
            <p title={description} className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
            <Badge variant="secondary">{space.is_creator ? "Yours" : "Shared with you"}</Badge>
            <span>{space.template.name}</span>
            <span aria-hidden="true">·</span>
            <span>
              Created <RelativeTime date={space.created_at} />
            </span>
            <span aria-hidden="true">·</span>
            <span>{plural(space.members.length, "person", "people")}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AvatarStack members={space.members} ownerId={ownerIdOf(space)} />
          <InviteDialog spaceId={space.id}>
            <Button type="button" variant="outline">
              <UserPlusIcon aria-hidden="true" />
              Invite
            </Button>
          </InviteDialog>
          <SpaceMenu
            spaceId={space.id}
            spaceName={space.name}
            isCreator={space.is_creator}
            template={space.template}
            onTemplateSaved={onTemplateSaved}
          />
        </div>
      </div>
      {status === "offline" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Live updates are paused. Trying to reconnect…
        </p>
      ) : null}
    </div>
  );
}
