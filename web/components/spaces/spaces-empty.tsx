import { InboxIcon, MailIcon, OrbitIcon, PlusIcon, SearchXIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { NewSpaceDialog } from "@/components/spaces/new-space-dialog";
import type { SpacesEmptyProps } from "@/components/spaces/spaces-empty.types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function newSpaceAction(size: "default" | "lg"): ReactNode {
  return (
    <NewSpaceDialog>
      <Button size={size}>
        <PlusIcon aria-hidden="true" />
        New space
      </Button>
    </NewSpaceDialog>
  );
}

export function SpacesEmpty({ kind, query = "", onClearSearch }: SpacesEmptyProps) {
  return (
    <Card className="border-dashed bg-card/50 shadow-none">
      {kind === "none" ? (
        <EmptyState
          icon={<OrbitIcon aria-hidden="true" />}
          title="Start your first space"
          action={newSpaceAction("lg")}
        >
          A space is where you and someone else share things. Make one, invite them with a link,
          then say “share this to Orbit” in your assistant.
        </EmptyState>
      ) : null}
      {kind === "yours" ? (
        <EmptyState
          icon={<OrbitIcon aria-hidden="true" />}
          title="No spaces of your own yet"
          action={newSpaceAction("default")}
        >
          Spaces you create show up here, ready to invite people into.
        </EmptyState>
      ) : null}
      {kind === "shared" ? (
        <EmptyState icon={<UsersIcon aria-hidden="true" />} title="Nothing shared with you yet">
          When someone invites you to a space and you join, it shows up here. Invitations that are
          still waiting live under Pending.
        </EmptyState>
      ) : null}
      {kind === "pending" ? (
        <EmptyState icon={<MailIcon aria-hidden="true" />} title="No pending invitations">
          When someone invites you to a space by email, it appears here so you can join or decline
          it.
        </EmptyState>
      ) : null}
      {kind === "search" ? (
        <EmptyState
          icon={<SearchXIcon aria-hidden="true" />}
          title={`No spaces match “${query}”`}
          action={
            onClearSearch ? (
              <Button type="button" variant="outline" onClick={onClearSearch}>
                <InboxIcon aria-hidden="true" />
                Show all spaces
              </Button>
            ) : null
          }
        >
          Try a name, a person, an assistant or something from a shared fact.
        </EmptyState>
      ) : null}
    </Card>
  );
}
