import { SparklesIcon, Undo2Icon } from "lucide-react";
import { useId } from "react";

import { ShareItemMenu } from "@/components/space/share-item-menu";
import { ExpandableText } from "@/components/space/expandable-text";
import type { FeedItemProps } from "@/components/space/feed-item.types";
import { PlanText } from "@/components/space/plan-text";
import { ProvenanceLine } from "@/components/space/provenance-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sourceTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { itemSource } from "@/lib/provenance";
import { cn } from "@/lib/utils";

export function FeedItem({ item, meId, fresh, onRetract }: FeedItemProps) {
  const titleId = useId();
  const isPlan = item.kind === "plan";
  return (
    <article
      aria-labelledby={titleId}
      data-fresh={fresh ? "true" : undefined}
      style={isPlan ? undefined : cssVars(toneVars(sourceTone(item.via)))}
      className={cn(
        "rounded-lg border bg-card p-4 shadow-card sm:p-5",
        isPlan ? "ai-frame" : "source-rail pl-5 sm:pl-6",
        fresh &&
          "motion-safe:animate-in motion-safe:duration-500 motion-safe:fade-in-0 motion-safe:slide-in-from-top-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {isPlan ? (
            <Badge className="self-start">
              <SparklesIcon aria-hidden="true" />
              Plan written by Orbit
            </Badge>
          ) : null}
          <h3
            id={titleId}
            className="text-lg leading-snug font-semibold tracking-tight break-words"
          >
            {item.title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ShareItemMenu title={item.title} content={item.content} />
          {item.can_retract ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Retract ${item.title}`}
              onClick={() => onRetract(item)}
            >
              <Undo2Icon aria-hidden="true" />
              Retract
            </Button>
          ) : null}
        </div>
      </div>
      {isPlan ? (
        <details className="mt-3">
          <summary className="w-fit rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline">
            Show plan
          </summary>
          <PlanText text={item.content} className="mt-3" />
        </details>
      ) : (
        <ExpandableText text={item.content} className="mt-2" />
      )}
      <ProvenanceLine
        source={itemSource(item)}
        createdAt={item.created_at}
        meId={meId}
        className="mt-4"
      />
    </article>
  );
}
