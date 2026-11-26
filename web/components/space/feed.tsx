"use client";

import { InboxIcon } from "lucide-react";
import { useId } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorNotice } from "@/components/common/error-notice";
import { FeedItem } from "@/components/space/feed-item";
import type { FeedProps } from "@/components/space/feed.types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { groupByDay } from "@/lib/feed-days";
import { useNow } from "@/lib/use-now";

export function Feed({
  items,
  meId,
  freshIds,
  hasMore,
  loadingMore,
  error,
  onLoadMore,
  onRetract,
  timeZone = "UTC",
}: FeedProps) {
  const now = useNow();
  const baseId = useId();
  const days = groupByDay(items, timeZone, now);
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3">
      <h2 id="feed-title" className="heading-section">
        Feed
      </h2>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<InboxIcon aria-hidden="true" />} title="Nothing shared yet">
            Say “share this to Orbit” in your assistant, or use the box above.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => {
            const labelId = `${baseId}-${day.key}`;
            return (
              <div key={day.key} className="flex flex-col gap-3">
                <p
                  id={labelId}
                  className="flex items-center gap-3 text-sm font-medium text-muted-foreground after:h-px after:flex-1 after:bg-border"
                  suppressHydrationWarning
                >
                  {day.label}
                </p>
                <ol aria-labelledby={labelId} className="flex flex-col gap-3">
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <FeedItem
                        item={item}
                        meId={meId}
                        fresh={freshIds.has(item.id)}
                        onRetract={onRetract}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
      <ErrorNotice message={error} />
      {hasMore ? (
        <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </section>
  );
}
