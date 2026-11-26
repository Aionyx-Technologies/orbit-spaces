"use client";

import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type {
  EditTemplateDialogProps,
  EditTemplateFormProps,
} from "@/components/templates/edit-template-dialog.types";
import { TemplateForm } from "@/components/templates/template-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, describeError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { canSaveTemplate, toFormValue, toTemplateInput } from "@/lib/template-form";

function EditTemplateForm({ spaceId, template, onClose, onSaved }: EditTemplateFormProps) {
  const [value, setValue] = useState(() => toFormValue(template));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = canSaveTemplate(value) && !pending;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saved = await api.spaces.setTemplate(spaceId, toTemplateInput(value));
      onSaved(saved);
      toast.success("Template saved");
      onClose();
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <TemplateForm value={value} onChange={setValue} />
      <ErrorNotice message={error} />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!canSave}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTemplateDialog({
  spaceId,
  template,
  open,
  onOpenChange,
  onSaved,
}: EditTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
          <DialogDescription>
            Everyone in this space can change this. It shapes the suggested facts, how the next
            combined plan is laid out and the tips for an empty space. Nothing already shared and no
            earlier plan changes.
          </DialogDescription>
        </DialogHeader>
        <EditTemplateForm
          spaceId={spaceId}
          template={template}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
