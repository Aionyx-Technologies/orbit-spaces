"use client";

import { HistoryIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FactForm } from "@/components/space/fact-form";
import { FactHistoryDialog } from "@/components/space/fact-history-dialog";
import type { FactEditing, MemoryCardProps } from "@/components/space/memory-card.types";
import { ProvenanceLine } from "@/components/space/provenance-line";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError } from "@/lib/api";
import type { Fact, FactResult } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { factSource } from "@/lib/provenance";
import { cn } from "@/lib/utils";

type HistoryView = { open: false } | { open: true; factKey?: string };

export function MemoryCard({
  spaceId,
  facts,
  unsetFacts = [],
  meId,
  onSaved,
  onDeleted,
}: MemoryCardProps) {
  const [editing, setEditing] = useState<FactEditing>({ mode: "none" });
  const [deleting, setDeleting] = useState<Fact | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryView>({ open: false });
  const card = useRef<HTMLDivElement>(null);
  // The control that opened the form, so focus goes back to it on close.
  const opener = useRef<string | null>(null);

  useEffect(() => {
    if (editing.mode !== "none" || deleting !== null || opener.current === null) {
      return;
    }
    const target = card.current?.querySelector<HTMLElement>(
      `[data-fact-opener="${CSS.escape(opener.current)}"]`,
    );
    opener.current = null;
    target?.focus();
  }, [editing, deleting]);

  function open(next: FactEditing, openerId: string) {
    opener.current = openerId;
    setEditing(next);
  }

  function close() {
    setEditing({ mode: "none" });
  }

  function saved(result: FactResult, previousKey?: string) {
    if (previousKey !== undefined) {
      opener.current = `edit:${result.fact.key}`;
    }
    close();
    if (previousKey === undefined) {
      onSaved(result);
    } else {
      onSaved(result, previousKey);
    }
  }

  function askToDelete(fact: Fact) {
    setDeleteError(null);
    setDeleting(fact);
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    setDeletePending(true);
    setDeleteError(null);
    try {
      await api.memory.remove(spaceId, deleting.key);
      opener.current = "add:new";
      close();
      onDeleted(deleting.key);
      toast.success(`Deleted “${deleting.key}”`);
      setDeleting(null);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setDeleteError(describeError(failure));
      }
    } finally {
      setDeletePending(false);
    }
  }

  const editingKey = editing.mode === "edit" ? editing.fact.key : null;
  const addingKey = editing.mode === "add" ? (editing.suggested?.key ?? null) : null;

  return (
    <Card ref={card} aria-labelledby="memory-title" role="region">
      <CardHeader>
        <CardTitle id="memory-title">Shared memory</CardTitle>
        <CardDescription>Facts everyone here, and their assistants, can see.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {facts.length === 0 ? (
          <p className="text-base text-muted-foreground">
            No facts yet. Add things you both need to remember, like dates or a budget.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-surface-2/40">
            {facts.map((fact) => (
              <li
                key={fact.key}
                className={cn("group/fact px-3.5 py-3", editingKey === fact.key && "bg-muted/60")}
              >
                {editingKey === fact.key ? (
                  <FactForm
                    key={fact.key}
                    spaceId={spaceId}
                    initialKey={fact.key}
                    initialValue={fact.value}
                    lockKey
                    inline
                    renamable
                    onSaved={saved}
                    onCancel={close}
                    onDelete={() => askToDelete(fact)}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-eyebrow text-muted-foreground">{fact.key}</p>
                        <p className="mt-1.5 text-base leading-snug font-medium text-pretty break-words whitespace-pre-wrap">
                          {fact.value}
                        </p>
                      </div>
                      <div className="-mt-1.5 -mr-1.5 flex shrink-0 text-muted-foreground opacity-70 group-focus-within/fact:opacity-100 group-hover/fact:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`History of ${fact.key}`}
                          data-fact-opener={`history:${fact.key}`}
                          onClick={() => setHistory({ open: true, factKey: fact.key })}
                        >
                          <HistoryIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${fact.key}`}
                          data-fact-opener={`edit:${fact.key}`}
                          onClick={() => open({ mode: "edit", fact }, `edit:${fact.key}`)}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <ProvenanceLine
                      source={factSource(fact)}
                      createdAt={fact.created_at}
                      meId={meId}
                      className="mt-2"
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {unsetFacts.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-eyebrow text-muted-foreground">Suggested for this space</p>
            <ul aria-label="Suggested facts" className="flex flex-col gap-2.5">
              {unsetFacts.map((suggestion) => (
                <li key={suggestion.key} className="rounded-md border border-dashed p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-medium break-words">{suggestion.key}</p>
                      {suggestion.hint ? (
                        <p className="mt-1 text-sm break-words text-muted-foreground">
                          {suggestion.hint}
                        </p>
                      ) : null}
                    </div>
                    {addingKey === suggestion.key ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Add ${suggestion.key}`}
                        data-fact-opener={`add:${suggestion.key}`}
                        onClick={() =>
                          open({ mode: "add", suggested: suggestion }, `add:${suggestion.key}`)
                        }
                      >
                        <PlusIcon aria-hidden="true" />
                        Add
                      </Button>
                    )}
                  </div>
                  {addingKey === suggestion.key ? (
                    <FactForm
                      key={suggestion.key}
                      spaceId={spaceId}
                      initialKey={suggestion.key}
                      lockKey
                      inline
                      onSaved={saved}
                      onCancel={close}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {editing.mode === "add" && editing.suggested === undefined ? (
          <FactForm key="new" spaceId={spaceId} onSaved={saved} onCancel={close} />
        ) : null}
        <div className="-ml-3 flex flex-wrap items-center justify-between gap-1">
          {editing.mode === "none" ? (
            <Button
              type="button"
              variant="ghost"
              data-fact-opener="add:new"
              onClick={() => open({ mode: "add" }, "add:new")}
            >
              <PlusIcon aria-hidden="true" />
              Add a fact
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setHistory({ open: true })}
          >
            <HistoryIcon aria-hidden="true" />
            Memory history
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(null);
          }
        }}
        title={deleting ? `Delete “${deleting.key}”?` : "Delete this fact?"}
        description="It is removed for everyone in this space and their assistants. The change is kept in the memory history, so anyone can see who deleted it and what it said."
        confirmLabel="Delete fact"
        destructive
        pending={deletePending}
        pendingLabel="Deleting…"
        error={deleteError}
        onConfirm={confirmDelete}
      />
      <FactHistoryDialog
        spaceId={spaceId}
        factKey={history.open ? history.factKey : undefined}
        meId={meId}
        open={history.open}
        onOpenChange={(next) => {
          if (!next) {
            setHistory({ open: false });
          }
        }}
      />
    </Card>
  );
}
