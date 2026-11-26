"use client";

import { SendIcon } from "lucide-react";
import { useRef, useState, type SubmitEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type { ShareBoxProps } from "@/components/space/share-box.types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { CONTENT_MAX, CONTENT_WARN_AT, TITLE_MAX } from "@/lib/constants";
import { deriveTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ShareBox({ spaceId, onShared }: ShareBoxProps) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [titleVisible, setTitleVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const overBy = content.length - CONTENT_MAX;
  const overLabel = `${overBy.toLocaleString("en")} ${overBy === 1 ? "character" : "characters"}`;
  const showCounter = content.length >= CONTENT_WARN_AT;
  const canShare = content.trim() !== "" && overBy <= 0 && !pending;

  async function share() {
    if (!canShare) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const item = await api.items.share(spaceId, {
        title: title.trim() || deriveTitle(content),
        content,
      });
      onShared(item);
      toast.success("Shared with this space");
      setContent("");
      setTitle("");
      setTitleVisible(false);
      textarea.current?.focus();
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void share();
  }

  function submitWithKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void share();
    }
  }

  return (
    <Card className="focus-within:border-ring/60 focus-within:shadow-lift motion-safe:transition-[border-color,box-shadow]">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4 sm:p-5">
        <Label htmlFor="share-content" className="sr-only">
          Share something
        </Label>
        <Textarea
          id="share-content"
          ref={textarea}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={submitWithKeyboard}
          placeholder="Share something with this space…"
          aria-invalid={overBy > 0}
          aria-describedby="share-hint"
          className={cn(
            "motion-safe:transition-[min-height] motion-safe:duration-200",
            content || titleVisible ? "min-h-28" : "min-h-14 focus:min-h-28",
          )}
        />
        {titleVisible ? (
          <div className="grid gap-2">
            <Label htmlFor="share-title">Title</Label>
            <Input
              id="share-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder={content.trim() ? deriveTitle(content) : "A short title"}
              autoComplete="off"
            />
          </div>
        ) : null}
        <ErrorNotice message={error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {titleVisible ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTitleVisible(true)}
                className="-ml-3"
              >
                Add a title
              </Button>
            )}
            <p
              id="share-hint"
              aria-live="polite"
              className={cn("text-sm text-muted-foreground", overBy > 0 && "text-destructive")}
            >
              {overBy > 0
                ? `Too long by ${overLabel}`
                : showCounter
                  ? `${content.length.toLocaleString("en")} of ${CONTENT_MAX.toLocaleString("en")}`
                  : "Only what you share here is visible to the others."}
            </p>
          </div>
          <Button type="submit" disabled={!canShare}>
            <SendIcon aria-hidden="true" />
            {pending ? "Sharing…" : "Share"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
