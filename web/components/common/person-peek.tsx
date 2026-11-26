"use client";

import { Popover } from "radix-ui";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { MemberDetails } from "@/components/common/member-details";
import { PEEK_CARD } from "@/components/common/peek-styles";
import type { PersonPeekProps } from "@/components/common/person-peek.types";
import { cn } from "@/lib/utils";

const HOVER_DELAY_MS = 120;

export function PersonPeek({ member, isOwner = false, children, className }: PersonPeekProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openedByPointer = useRef(false);
  const pinned = useRef(false);
  const label = member.is_you ? "Your profile" : `${member.display_name}'s profile`;

  useEffect(() => () => clearTimeout(timer.current), []);

  function settle(next: boolean, byPointer: boolean) {
    clearTimeout(timer.current);
    openedByPointer.current = next && byPointer;
    pinned.current = false;
    setOpen(next);
  }

  function pointerMoved(event: PointerEvent, next: boolean) {
    if (event.pointerType !== "mouse" || (!next && pinned.current)) {
      return;
    }
    clearTimeout(timer.current);
    if (open === next) {
      return;
    }
    timer.current = setTimeout(() => settle(next, true), HOVER_DELAY_MS);
  }

  function holdOpen(event: PointerEvent) {
    if (event.pointerType === "mouse") {
      clearTimeout(timer.current);
    }
  }

  function clicked(event: MouseEvent) {
    if (open && openedByPointer.current && !pinned.current) {
      event.preventDefault();
      pinned.current = true;
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => settle(next, false)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn("rounded-full", className)}
          onClick={clicked}
          onPointerEnter={(event) => pointerMoved(event, true)}
          onPointerLeave={(event) => pointerMoved(event, false)}
        >
          <span className="sr-only">{label}</span>
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={10}
          aria-label={label}
          className={PEEK_CARD}
          onPointerEnter={holdOpen}
          onPointerLeave={(event) => pointerMoved(event, false)}
          onOpenAutoFocus={(event) => {
            if (openedByPointer.current) {
              event.preventDefault();
            }
          }}
        >
          <MemberDetails member={member} isOwner={isOwner} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
