"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import { SetupPrompt } from "@/components/spaces/new-space/setup-prompt";
import { SuggestionPanel } from "@/components/spaces/new-space/suggestion-panel";
import { TemplateChips } from "@/components/spaces/new-space/template-chips";
import type { NewSpaceDialogProps } from "@/components/spaces/new-space-dialog.types";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, describeError } from "@/lib/api";
import type { SpaceTemplateChoice, Template } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { GENERAL_TEMPLATE_ID } from "@/lib/constants";
import { useMe, useTemplates } from "@/lib/queries";
import {
  CHIP_PLACEHOLDERS,
  factsToSend,
  rowsFromTemplate,
  syncRowsWithTemplate,
} from "@/lib/space-setup";
import type { FactRow } from "@/lib/space-setup.types";
import { canSaveTemplate, toFormValue, toTemplateInput } from "@/lib/template-form";
import type { TemplateFormValue } from "@/lib/template-form.types";
import { cn } from "@/lib/utils";

const ASK = "What's this space for?";
const PICK = "Pick a starting point";
const NOT_SET_UP = "Orbit couldn't set that up. Pick a starting point below.";
const TEMPLATES_UNAVAILABLE = "Templates couldn't be loaded, so only Blank is offered.";
const FALLBACK_PLACEHOLDER = CHIP_PLACEHOLDERS[GENERAL_TEMPLATE_ID] ?? "";
const FALLBACK_BLANK: Template = {
  id: GENERAL_TEMPLATE_ID,
  name: "Blank",
  icon: "",
  description: "",
  facts: [],
  plan_sections: [],
  combine_hint: "",
  tips: [],
};

type Setup = {
  suggested: boolean;
  templateId: string | null;
  placeholder: string;
  template: TemplateFormValue;
  rows: FactRow[];
  customized: boolean;
};

function fromChip(template: Template): Setup {
  return {
    suggested: false,
    templateId: template.id,
    placeholder: CHIP_PLACEHOLDERS[template.id] ?? FALLBACK_PLACEHOLDER,
    template: toFormValue(template),
    rows: rowsFromTemplate(template),
    customized: false,
  };
}

export function NewSpaceDialog({ children, defaultOpen = false }: NewSpaceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [purpose, setPurpose] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [name, setName] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusName, setFocusName] = useState(0);
  const run = useRef(0);
  const nameField = useRef<HTMLInputElement>(null);

  const { data: templatesData, error: templatesError } = useTemplates(open);
  const { data: me, error: meError } = useMe(open);
  const meSettled = me !== undefined || meError !== undefined;
  const draftEnabled = me?.draft_enabled === true;
  const chips = templatesData?.templates ?? (templatesError ? [FALLBACK_BLANK] : undefined);
  const shown = working || setup !== null;
  const canCreate =
    setup !== null && !working && !pending && name.trim() !== "" && canSaveTemplate(setup.template);

  useEffect(() => {
    if (focusName > 0) {
      nameField.current?.focus();
    }
  }, [focusName]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      startRun();
      setPurpose("");
      setName("");
    }
  }

  function startRun(): number {
    run.current += 1;
    setWorking(false);
    setNotice(null);
    setSetup(null);
    setCustomizing(false);
    setError(null);
    return run.current;
  }

  function choose(template: Template) {
    startRun();
    setSetup(fromChip(template));
    setName("");
    setFocusName((count) => count + 1);
  }

  async function suggest() {
    const wanted = purpose.trim();
    if (wanted === "") {
      return;
    }
    const current = startRun();
    setWorking(true);
    try {
      const result = await api.spaces.suggest(wanted);
      if (current !== run.current) {
        return;
      }
      if (result.suggested) {
        setSetup({
          suggested: true,
          templateId: null,
          placeholder: CHIP_PLACEHOLDERS[result.base_template_id] ?? FALLBACK_PLACEHOLDER,
          template: toFormValue(result.template),
          rows: rowsFromTemplate(result.template, result.facts),
          customized: false,
        });
        setName(result.name);
      } else {
        const blank = chips?.find((template) => template.id === GENERAL_TEMPLATE_ID);
        setSetup(blank ? fromChip(blank) : { ...fromChip(result.template), templateId: null });
        setName("");
        setNotice(NOT_SET_UP);
      }
    } catch (failure) {
      if (current === run.current && !redirectIfUnauthenticated(failure)) {
        setNotice(
          failure instanceof ApiError && failure.status === 429
            ? describeError(failure)
            : NOT_SET_UP,
        );
      }
    } finally {
      if (current === run.current) {
        setWorking(false);
      }
    }
  }

  function changeTemplate(template: TemplateFormValue) {
    setSetup((current) =>
      current === null
        ? null
        : {
            ...current,
            template,
            rows: syncRowsWithTemplate(current.rows, template),
            customized: true,
          },
    );
  }

  function changeRows(rows: FactRow[]) {
    setSetup((current) => (current === null ? null : { ...current, rows }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || setup === null) {
      return;
    }
    const choice: SpaceTemplateChoice =
      setup.templateId !== null && !setup.customized
        ? { template_id: setup.templateId }
        : { template: toTemplateInput(setup.template) };
    setPending(true);
    setError(null);
    try {
      const space = await api.spaces.create(name.trim(), choice, factsToSend(setup.rows));
      toast.success("Space created");
      changeOpen(false);
      router.push(`/spaces/${space.id}`);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="sm:max-w-xl"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-inline-edit]")) {
            event.preventDefault();
          }
        }}
      >
        <form onSubmit={submit} className="grid gap-5">
          <DialogTitle className="pr-10">{meSettled && !draftEnabled ? PICK : ASK}</DialogTitle>
          {draftEnabled ? (
            <SetupPrompt
              label={ASK}
              value={purpose}
              onChange={setPurpose}
              onSubmit={() => void suggest()}
              working={working}
              notice={notice}
              quiet={setup !== null}
            />
          ) : null}
          <div>
            {chips ? (
              <div className="grid gap-2">
                <TemplateChips
                  templates={chips}
                  selected={setup !== null && !setup.suggested ? setup.templateId : null}
                  onChoose={choose}
                  disabled={pending}
                />
                {templatesError ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {TEMPLATES_UNAVAILABLE}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex gap-2" aria-hidden="true">
                <Skeleton className="h-9 w-20 rounded-full" />
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            )}
            <div
              className={cn(
                "grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200 motion-safe:ease-out",
                shown ? "-mb-6 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="-mx-4 min-h-0 overflow-hidden">
                <div className={cn(shown && "px-4 pt-5 pb-6")}>
                  {working ? (
                    <div aria-busy="true" className="grid gap-3 border-t border-border pt-5">
                      <Skeleton className="h-6 w-2/5" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>
                  ) : setup !== null ? (
                    <SuggestionPanel
                      suggested={setup.suggested}
                      name={name}
                      namePlaceholder={setup.placeholder}
                      nameRef={nameField}
                      onNameChange={setName}
                      template={setup.template}
                      onTemplateChange={changeTemplate}
                      rows={setup.rows}
                      onRowsChange={changeRows}
                      customizing={customizing}
                      onCustomizingChange={setCustomizing}
                      error={error}
                      canCreate={canCreate}
                      pending={pending}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
