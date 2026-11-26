"use client";

import { Loader2Icon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AiUsesNote } from "@/components/common/ai-uses-note";
import { ErrorNotice } from "@/components/common/error-notice";
import { ShareItemMenu } from "@/components/space/share-item-menu";
import { PlanText } from "@/components/space/plan-text";
import type { PlanCardProps } from "@/components/space/plan-card.types";
import { ProvenanceLine } from "@/components/space/provenance-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { itemSource } from "@/lib/provenance";

export function PlanCard({
  spaceId,
  plan,
  meId,
  combineEnabled,
  sections,
  aiUses,
  billingEnabled,
  onCombined,
  onUsesChanged,
}: PlanCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan && !combineEnabled) {
    return null;
  }

  async function combine() {
    setPending(true);
    setError(null);
    try {
      const result = await api.combine.run(spaceId);
      onCombined(result);
      toast.success(
        result.created ? "Combined into a new plan" : "Nothing new since the last plan",
      );
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
      onUsesChanged?.();
    }
  }

  return (
    <Card aria-labelledby="plan-title" aria-busy={pending} className="ai-frame" role="region">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-3">
          <Badge className="self-start">
            <SparklesIcon aria-hidden="true" />
            Written by Orbit
          </Badge>
          <CardTitle id="plan-title">Latest plan</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {plan ? <ShareItemMenu title={plan.title} content={plan.content} /> : null}
          {combineEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void combine()}
              disabled={pending || aiUses?.remaining === 0}
            >
              {pending ? (
                <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
              ) : (
                <WandSparklesIcon aria-hidden="true" />
              )}
              {pending ? "Combining…" : "Combine"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorNotice message={error} />
        {combineEnabled && aiUses ? (
          <AiUsesNote uses={aiUses} billingEnabled={billingEnabled} />
        ) : null}
        {plan ? (
          <>
            <PlanText text={plan.content} sections={sections} />
            <ProvenanceLine source={itemSource(plan)} createdAt={plan.created_at} meId={meId} />
          </>
        ) : (
          <p className="text-base text-muted-foreground">
            No plan yet. Once you have each shared something, press Combine and Orbit will merge it
            into one plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
