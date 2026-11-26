"use client";

import { Trash2Icon } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type { FactFormProps } from "@/components/space/fact-form.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, describeError } from "@/lib/api";
import type { FactResult } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { FACT_KEY_MAX, FACT_VALUE_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function FactForm({
  spaceId,
  initialKey = "",
  initialValue = "",
  lockKey = false,
  inline = false,
  renamable = false,
  onSaved,
  onCancel,
  onDelete,
}: FactFormProps) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showName = !inline || renamable;
  const renaming = renamable && key.trim() !== "" && key.trim() !== initialKey;
  const canSave = key.trim() !== "" && value.trim() !== "" && !pending;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    setPending(true);
    setError(null);
    let renamed: FactResult | null = null;
    try {
      if (renaming) {
        renamed = await api.memory.rename(spaceId, { key: initialKey, new_key: key });
      }
      const valueChanged = !renamable || value !== initialValue;
      const result = valueChanged
        ? await api.memory.set(spaceId, { key: renamed?.fact.key ?? key, value })
        : renamed;
      if (result === null) {
        onCancel();
        return;
      }
      if (renamed) {
        onSaved(result, initialKey);
      } else {
        onSaved(result);
      }
      toast.success(
        renamed && !valueChanged
          ? `Renamed to “${result.fact.key}”`
          : result.changed || renamed
            ? "Fact saved"
            : "That fact already has this value",
      );
    } catch (failure) {
      if (redirectIfUnauthenticated(failure)) {
        return;
      }
      if (renamed) {
        // The rename went through but the new value did not: keep the screen
        // in step with the server and say what is left to do.
        onSaved(renamed, initialKey);
        toast.error(`Renamed to “${renamed.fact.key}”, but the value was not saved.`);
        return;
      }
      setError(describeError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
      className={cn("flex flex-col gap-3", inline ? "mt-1" : "rounded-md border bg-muted/50 p-4")}
    >
      {showName ? (
        <div className="grid gap-1.5">
          <Label htmlFor="fact-key" className={cn(inline && "text-xs text-muted-foreground")}>
            Fact name
          </Label>
          <Input
            id="fact-key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            maxLength={FACT_KEY_MAX}
            placeholder="Fact name"
            autoComplete="off"
            readOnly={lockKey && !renamable}
            autoFocus={!lockKey && !renamable}
          />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label
          htmlFor="fact-value"
          className={cn(inline && (renamable ? "text-xs text-muted-foreground" : "sr-only"))}
        >
          Fact value
        </Label>
        <Textarea
          id="fact-value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={FACT_VALUE_MAX}
          placeholder="Type the value"
          className="min-h-20"
          autoFocus={lockKey || inline}
        />
      </div>
      <ErrorNotice message={error} />
      <div className="flex items-center justify-end gap-2">
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={pending}
            aria-label={`Delete ${initialKey}`}
            title="Delete this fact"
            className="mr-auto -ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {pending ? "Saving…" : "Save fact"}
        </Button>
      </div>
    </form>
  );
}
