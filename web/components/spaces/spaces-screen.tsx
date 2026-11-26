"use client";

import { PlusIcon } from "lucide-react";
import { Tabs } from "radix-ui";
import { useMemo, useState } from "react";

import { ConnectBanner } from "@/components/spaces/connect-banner";
import { FilterTabs } from "@/components/spaces/filter-tabs";
import { NewSpaceDialog } from "@/components/spaces/new-space-dialog";
import { PendingSection } from "@/components/spaces/pending-section";
import { SpacesEmpty } from "@/components/spaces/spaces-empty";
import { SpacesList } from "@/components/spaces/spaces-list";
import type { SpacesScreenProps } from "@/components/spaces/spaces-screen.types";
import { SpacesToolbar } from "@/components/spaces/spaces-toolbar";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { useInvitations, useSpaces } from "@/lib/queries";
import {
  countSpaces,
  emptyKindFor,
  filterInvitations,
  filterSpaces,
  parseTab,
  sortSpaces,
  SPACE_LAYOUTS,
  SPACE_SORTS,
} from "@/lib/space-filters";
import type { SpaceTab } from "@/lib/space-filters.types";
import { withPreview } from "@/lib/spaces";
import { useInvitationActions } from "@/lib/use-invitation-actions";
import { useStoredChoice } from "@/lib/use-stored-choice";

const CREATED_LIMIT_ID = "created-spaces-limit";

const SPACES_HEADING: Readonly<Record<SpaceTab, string>> = {
  all: "All spaces",
  yours: "Your spaces",
  shared: "Shared with you",
  pending: "Pending spaces",
};

export function SpacesScreen({
  initial,
  initialInvitations,
  initialTab = "all",
  openNewSpace = false,
}: SpacesScreenProps) {
  const { data: spacesData } = useSpaces(initial);
  const { invitations: invitationsData, forget } = useInvitations(initialInvitations);
  const { accept, decline } = useInvitationActions(forget);
  const [tab, setTab] = useState<SpaceTab>(initialTab);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useStoredChoice("orbit-spaces-sort", SPACE_SORTS, "activity");
  const [layout, setLayout] = useStoredChoice("orbit-spaces-layout", SPACE_LAYOUTS, "grid");

  const spaces = useMemo(
    () => (spacesData ?? initial).spaces.map(withPreview),
    [spacesData, initial],
  );
  const invitations = invitationsData.invitations;
  const counts = countSpaces(spaces, invitations);
  const visibleSpaces = sortSpaces(filterSpaces(spaces, tab, query), sort);
  const visibleInvitations = filterInvitations(invitations, query);
  const showPending = (tab === "all" || tab === "pending") && visibleInvitations.length > 0;
  const showSpaces = tab !== "pending" && visibleSpaces.length > 0;
  const isBlank = counts.all === 0 && counts.pending === 0;
  const limits = (spacesData ?? initial).limits;
  const maxCreated = limits?.max_created_spaces ?? null;
  const atCreatedLimit = maxCreated !== null && (limits?.created_spaces ?? 0) >= maxCreated;
  const summary = [
    plural(counts.all, "space"),
    counts.shared > 0 ? `${counts.shared} shared with you` : null,
    counts.pending > 0 ? `${plural(counts.pending, "invitation")} waiting` : null,
    maxCreated !== null ? `${limits?.created_spaces ?? 0} of ${maxCreated} spaces created` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function changeTab(next: string) {
    const chosen = parseTab(next);
    setTab(chosen);
    window.history.replaceState(null, "", chosen === "all" ? "/spaces" : `/spaces?tab=${chosen}`);
  }

  return (
    <Tabs.Root value={tab} onValueChange={changeTab} className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="heading-page">Spaces</h1>
          <p className="text-base text-muted-foreground">
            {isBlank ? "Nothing here yet" : summary}
          </p>
        </div>
        {isBlank ? null : atCreatedLimit ? (
          <div className="flex flex-col items-end gap-2">
            <Button size="lg" disabled aria-describedby={CREATED_LIMIT_ID}>
              <PlusIcon aria-hidden="true" />
              New space
            </Button>
            <p id={CREATED_LIMIT_ID} className="max-w-xs text-right text-sm text-muted-foreground">
              {`You have created ${limits?.created_spaces ?? 0} of ${maxCreated} spaces on the free plan. Delete one to start another.`}
            </p>
          </div>
        ) : (
          <NewSpaceDialog defaultOpen={openNewSpace}>
            <Button size="lg">
              <PlusIcon aria-hidden="true" />
              New space
            </Button>
          </NewSpaceDialog>
        )}
      </header>

      {isBlank ? null : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <FilterTabs value={tab} counts={counts} />
          <SpacesToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            layout={layout}
            onLayoutChange={setLayout}
          />
        </div>
      )}

      <Tabs.Content value={tab} tabIndex={-1} className="flex flex-col gap-10 outline-hidden">
        {showPending ? (
          <PendingSection
            invitations={visibleInvitations}
            layout={layout}
            onAccept={accept}
            onDecline={decline}
          />
        ) : null}
        {showSpaces ? (
          <SpacesList
            spaces={visibleSpaces}
            layout={layout}
            heading={SPACES_HEADING[tab]}
            headingVisible={showPending}
          />
        ) : null}
        {showPending || showSpaces ? null : (
          <SpacesEmpty
            kind={emptyKindFor(isBlank, query.trim() !== "", tab)}
            query={query.trim()}
            onClearSearch={() => setQuery("")}
          />
        )}
      </Tabs.Content>

      <p role="status" className="sr-only">
        {`${plural(visibleSpaces.length, "space")} shown`}
      </p>
      <ConnectBanner />
    </Tabs.Root>
  );
}
