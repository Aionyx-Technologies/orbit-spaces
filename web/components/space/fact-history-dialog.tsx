"use client";

import {
  ArrowRightIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import useSWR from "swr";

import { ErrorNotice } from "@/components/common/error-notice";
import type { FactHistoryDialogProps } from "@/components/space/fact-history-dialog.types";
import { ProvenanceLine } from "@/components/space/provenance-line";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeError, factHistoryKey, fetcher } from "@/lib/api";
import type { FactAction, FactEvent, FactHistory } from "@/lib/api.types";
import { factSource } from "@/lib/provenance";

const ICONS: Record<FactAction, LucideIcon> = {
  add: PlusIcon,
  edit: PencilIcon,
  rename: PencilLineIcon,
  delete: Trash2Icon,
};

export function FactHistoryDialog({
  spaceId,
  factKey,
  meId,
  open,
  onOpenChange,
}: FactHistoryDialogProps) {
  const { data, error, isLoading } = useSWR<FactHistory>(
    open ? factHistoryKey(spaceId, factKey) : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const entries = data?.entries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{factKey ? `History of ${factKey}` : "Memory history"}</DialogTitle>
          <DialogDescription>
            {factKey
              ? "Every change to this fact, newest first, including its earlier names."
              : "Every fact added, changed, renamed or deleted in this space, newest first."}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorNotice message={describeError(error)} /> : null}
        {isLoading ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {!isLoading && !error && entries.length === 0 ? (
          <p className="text-muted-foreground">No changes yet.</p>
        ) : null}
        {entries.length > 0 ? (
          <ol aria-label="Changes" className="flex flex-col">
            {entries.map((entry, index) => (
              <HistoryEntry
                key={`${entry.at}-${entry.action}-${entry.key}-${index}`}
                entry={entry}
                meId={meId}
                last={index === entries.length - 1}
              />
            ))}
          </ol>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryEntry({
  entry,
  meId,
  last,
}: Readonly<{ entry: FactEvent; meId: string; last: boolean }>) {
  const Icon = ICONS[entry.action];
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={
          entry.action === "delete"
            ? "grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
            : "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        }
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <p className="font-medium break-words">{summary(entry)}</p>
        <EntryDetail entry={entry} />
        <ProvenanceLine
          source={factSource({ set_by: entry.by, via: entry.via })}
          createdAt={entry.at}
          meId={meId}
        />
      </div>
    </li>
  );
}

function summary(entry: FactEvent): string {
  switch (entry.action) {
    case "add":
      return `Added ${entry.key}`;
    case "edit":
      return `Changed ${entry.key}`;
    case "rename":
      return `Renamed ${entry.previous_key ?? "a fact"} to ${entry.key}`;
    case "delete":
      return `Deleted ${entry.key}`;
  }
}

function EntryDetail({ entry }: Readonly<{ entry: FactEvent }>) {
  if (entry.action === "rename") {
    return null;
  }
  if (entry.action === "edit" && entry.previous_value !== null) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.9375rem] break-words">
        <del className="text-muted-foreground">{entry.previous_value}</del>
        <ArrowRightIcon aria-hidden="true" className="size-3.5 self-center text-muted-foreground" />
        <span className="sr-only">changed to</span>
        <ins className="no-underline">{entry.value}</ins>
      </p>
    );
  }
  return (
    <p className="text-[0.9375rem] break-words whitespace-pre-wrap">
      {entry.action === "delete" ? (
        <>
          <span className="text-muted-foreground">It was: </span>
          <del className="text-muted-foreground">{entry.value}</del>
        </>
      ) : (
        entry.value
      )}
    </p>
  );
}
