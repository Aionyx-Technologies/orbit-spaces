"use client";

import { Tabs } from "radix-ui";
import { useLayoutEffect, useRef, useState } from "react";

import type { FilterTabsProps } from "@/components/spaces/filter-tabs.types";
import { SPACE_TABS } from "@/lib/space-filters";
import type { SpaceTab } from "@/lib/space-filters.types";
import { cn } from "@/lib/utils";

const LABELS: Readonly<Record<SpaceTab, string>> = {
  all: "All",
  yours: "Yours",
  shared: "Shared with you",
  pending: "Pending",
};

type Indicator = Readonly<{ x: number; width: number }>;

export function FilterTabs({ value, counts }: FilterTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      setIndicator(active ? { x: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, counts]);

  return (
    <div className="scroll-fade -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Tabs.List
        ref={listRef}
        aria-label="Filter spaces"
        data-measured={indicator ? "true" : "false"}
        className="group/tabs relative inline-flex min-w-max items-center gap-1 rounded-full border bg-surface-2/80 p-1"
      >
        {indicator ? (
          <span
            aria-hidden="true"
            data-slot="tab-indicator"
            className="absolute inset-y-1 left-0 rounded-full border border-line-strong bg-card shadow-card motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-out-expo"
            style={{ width: indicator.width, transform: `translateX(${indicator.x}px)` }}
          />
        ) : null}
        {SPACE_TABS.map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            className={cn(
              "relative z-10 inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground outline-offset-2 hover:text-foreground data-[state=active]:text-foreground group-data-[measured=false]/tabs:data-[state=active]:bg-card group-data-[measured=false]/tabs:data-[state=active]:shadow-card motion-safe:transition-colors",
            )}
          >
            {LABELS[tab]}
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold tabular-nums",
                tab === "pending" && counts.pending > 0
                  ? "bg-ember text-ember-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {counts[tab]}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </div>
  );
}
