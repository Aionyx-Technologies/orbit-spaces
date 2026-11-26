"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import useSWR from "swr";

import { PaletteOption } from "@/components/command/palette-option";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetcher, INVITATIONS_KEY, SPACES_KEY } from "@/lib/api";
import type { InvitationsResponse, SpacesResponse } from "@/lib/api.types";
import { buildCommands, flattenSections, searchCommands } from "@/lib/command-search";
import type { CommandItem } from "@/lib/command-search.types";
import { withPreview } from "@/lib/spaces";
import { applyTheme } from "@/lib/theme-store";
import { useIsMac } from "@/lib/use-is-mac";

export function CommandPalette() {
  const router = useRouter();
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardMoved = useRef(false);
  const { data: spacesData } = useSWR<SpacesResponse>(open ? SPACES_KEY : null, fetcher);
  const { data: invitationData } = useSWR<InvitationsResponse>(
    open ? INVITATIONS_KEY : null,
    fetcher,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sections = useMemo(() => {
    const spaces = (spacesData?.spaces ?? []).map(withPreview);
    return searchCommands(buildCommands(spaces, invitationData?.invitations ?? []), query);
  }, [spacesData, invitationData, query]);
  const flat = flattenSections(sections);
  const indexOf = new Map(flat.map((item, index) => [item.id, index]));
  const active = Math.min(activeIndex, Math.max(flat.length - 1, 0));
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (keyboardMoved.current) {
      keyboardMoved.current = false;
      listRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function choose(item: CommandItem) {
    changeOpen(false);
    if (item.action.type === "theme") {
      applyTheme(item.action.choice);
    } else {
      router.push(item.action.href);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      keyboardMoved.current = true;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((active + step + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(flat[active]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-keyshortcuts="Control+K Meta+K"
          className="h-10 rounded-full px-3.5 text-muted-foreground sm:w-60 sm:justify-start sm:gap-2.5 lg:w-72"
        >
          <SearchIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only sm:flex-1 sm:truncate sm:text-left sm:whitespace-nowrap">
            Search or jump to…
          </span>
          <kbd
            aria-hidden="true"
            suppressHydrationWarning
            className="hidden rounded-md border bg-surface-2 px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium sm:block"
          >
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        showClose={false}
        className="gap-0 overflow-hidden p-0 sm:top-[14vh] sm:max-w-xl sm:translate-y-0 sm:p-0"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <DialogDescription className="sr-only">
          Type to find a space or run a command. Use the arrow keys to move and Enter to choose.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b px-4">
          <SearchIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={flat.length > 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search spaces or run a command"
            placeholder="Search spaces or run a command…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          <kbd
            aria-hidden="true"
            className="hidden rounded-md border bg-surface-2 px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-muted-foreground sm:block"
          >
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          id={`${baseId}-list`}
          role="listbox"
          aria-label="Results"
          className="max-h-[min(24rem,50dvh)] overflow-y-auto p-2"
        >
          {flat.length === 0 ? (
            <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">
              {`No results for “${query.trim()}”`}
            </p>
          ) : (
            sections.map((section) => (
              <div
                key={section.group}
                role="group"
                aria-labelledby={`${baseId}-group-${section.group}`}
              >
                <p
                  id={`${baseId}-group-${section.group}`}
                  className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground"
                >
                  {section.group}
                </p>
                {section.items.map((item) => {
                  const index = indexOf.get(item.id) ?? 0;
                  return (
                    <PaletteOption
                      key={item.id}
                      id={optionId(index)}
                      item={item}
                      active={index === active}
                      onActivate={() => setActiveIndex(index)}
                      onChoose={() => choose(item)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
