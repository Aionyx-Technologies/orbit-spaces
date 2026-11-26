"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Feed } from "@/components/space/feed";
import { MembersCard } from "@/components/space/members-card";
import { MemoryCard } from "@/components/space/memory-card";
import { PlanCard } from "@/components/space/plan-card";
import { RetractDialog } from "@/components/space/retract-dialog";
import { ShareBox } from "@/components/space/share-box";
import { SpaceGone } from "@/components/space/space-gone";
import { SpaceHeader } from "@/components/space/space-header";
import { SpaceMembersProvider } from "@/components/space/space-members";
import type { SpaceScreenProps } from "@/components/space/space-screen.types";
import { TipsCard } from "@/components/space/tips-card";
import { api, ApiError } from "@/lib/api";
import type { CombineResult, FactResult, Item, Template } from "@/lib/api.types";
import { removeFact, replaceFact, unsetFacts, upsertFact } from "@/lib/facts";
import { ownerIdOf } from "@/lib/members";
import { useSpace } from "@/lib/queries";
import { useFeed } from "@/lib/use-feed";
import { useMarkRead } from "@/lib/use-mark-read";
import { useSpaceEvents } from "@/lib/use-space-events";
import type { SpaceEvent } from "@/lib/use-space-events.types";

const ANNOUNCEMENT_MS = 4_000;
const NEW_CONTENT_EVENTS: ReadonlySet<string> = new Set(["item_added", "plan_added", "memory_set"]);

function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export function SpaceScreen({ me, initialSpace, initialFeed }: SpaceScreenProps) {
  const spaceId = initialSpace.id;
  const { space, error, refresh, update } = useSpace(spaceId, initialSpace);
  const feed = useFeed(spaceId, initialFeed);
  const markRead = useMarkRead(spaceId);
  const { refresh: refreshFeed, remove: removeFromFeed, add: addToFeed } = feed;
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const [retracting, setRetracting] = useState<Item | null>(null);
  const [aiUses, setAiUses] = useState(me.ai_uses);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(announcementTimer.current), []);

  const refreshAiUses = useCallback(() => {
    api.me
      .get()
      .then((fresh) => setAiUses(fresh.ai_uses))
      .catch(() => undefined);
  }, []);

  const markFresh = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setFreshIds((current) => new Set([...current, ...ids]));
    setAnnouncement("New activity in this space");
    clearTimeout(announcementTimer.current);
    announcementTimer.current = setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_MS);
  }, []);

  const refreshFeedAndMark = useCallback(async () => {
    markFresh(await refreshFeed());
  }, [markFresh, refreshFeed]);

  const status = useSpaceEvents(spaceId, {
    onEvent: (event: SpaceEvent) => {
      if (NEW_CONTENT_EVENTS.has(event.type)) {
        markRead();
      }
      if (event.type === "item_added") {
        void refreshFeedAndMark();
      } else if (event.type === "item_retracted") {
        if (typeof event.data.item_id === "string") {
          removeFromFeed(event.data.item_id);
        }
        void refreshFeedAndMark();
      } else if (event.type === "plan_added" || event.type === "profile_changed") {
        void refresh();
        void refreshFeedAndMark();
      } else {
        void refresh();
      }
    },
    onResync: () => {
      void refresh();
      void refreshFeedAndMark();
    },
  });

  if (isGone(error)) {
    return <SpaceGone />;
  }

  const showPlan = space.latest_plan !== null || me.combine_enabled;
  const feedItems = feed.items.filter((item) => item.id !== space.latest_plan?.id);
  const isEmpty = feedItems.length === 0 && space.memory.length === 0 && space.latest_plan === null;

  function shared(item: Item) {
    addToFeed(item);
    markFresh([item.id]);
  }

  function factSaved(result: FactResult, previousKey?: string) {
    void update((current) => {
      const memory =
        previousKey === undefined
          ? upsertFact(current.memory, result.fact)
          : replaceFact(current.memory, previousKey, result.fact);
      return { ...current, memory, unset_facts: unsetFacts(current.unset_facts, memory) };
    });
  }

  function factDeleted(key: string) {
    void update((current) => {
      const memory = removeFact(current.memory, key);
      return { ...current, memory, unset_facts: unsetFacts(current.template.facts, memory) };
    });
  }

  function templateSaved(template: Template) {
    void update((current) => ({
      ...current,
      template,
      unset_facts: unsetFacts(template.facts, current.memory),
    }));
    void refresh();
  }

  function notifyChanged(notifyEmail: boolean) {
    void update((current) => ({ ...current, notify_email: notifyEmail }));
  }

  function combined(result: CombineResult) {
    void update((current) => ({ ...current, latest_plan: result.item }));
    void refreshFeedAndMark();
  }

  return (
    <SpaceMembersProvider members={space.members}>
      <div className="flex flex-col gap-10">
        <SpaceHeader space={space} status={status} onTemplateSaved={templateSaved} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <div className="order-1">
              <ShareBox spaceId={spaceId} onShared={shared} />
            </div>
            {isEmpty ? (
              <div className="order-2">
                <TipsCard templateName={space.template.name} tips={space.template.tips} />
              </div>
            ) : null}
            {showPlan ? (
              <div className="order-2">
                <PlanCard
                  spaceId={spaceId}
                  plan={space.latest_plan}
                  meId={me.id}
                  combineEnabled={me.combine_enabled}
                  sections={space.template.plan_sections}
                  aiUses={aiUses}
                  billingEnabled={me.billing_enabled}
                  onCombined={combined}
                  onUsesChanged={refreshAiUses}
                />
              </div>
            ) : null}
            <div className="order-4">
              <Feed
                items={feedItems}
                meId={me.id}
                freshIds={freshIds}
                hasMore={feed.hasMore}
                loadingMore={feed.loadingMore}
                error={feed.error}
                onLoadMore={() => void feed.loadMore()}
                onRetract={setRetracting}
                timeZone={me.time_zone}
              />
            </div>
          </div>
          <aside
            aria-label="About this space"
            className="order-3 flex flex-col gap-6 lg:sticky lg:top-24 lg:order-none"
          >
            <MemoryCard
              spaceId={spaceId}
              facts={space.memory}
              unsetFacts={space.unset_facts}
              meId={me.id}
              onSaved={factSaved}
              onDeleted={factDeleted}
            />
            <MembersCard
              spaceId={spaceId}
              members={space.members}
              ownerId={ownerIdOf(space)}
              notifyEmail={space.notify_email}
              frequency={me.email_frequency}
              onNotifyChanged={notifyChanged}
              invites={space.invites}
              onInvitesChanged={() => void refresh()}
            />
          </aside>
        </div>
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <RetractDialog
          item={retracting}
          onClose={() => setRetracting(null)}
          onRetracted={(item) => removeFromFeed(item.id)}
        />
      </div>
    </SpaceMembersProvider>
  );
}
