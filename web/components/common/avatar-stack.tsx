"use client";

import { HoverCard } from "radix-ui";
import type { AvatarStackProps, PeekProps } from "@/components/common/avatar-stack.types";
import { MemberDetails } from "@/components/common/member-details";
import { PEEK_CARD } from "@/components/common/peek-styles";
import { PersonAvatar } from "@/components/common/person-avatar";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

function Peek({ trigger, children }: PeekProps) {
  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="top" sideOffset={10} className={PEEK_CARD}>
          {children}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

export function AvatarStack({ members, ownerId = null, max = 4, className }: AvatarStackProps) {
  const shown = members.slice(0, max);
  const rest = members.slice(max);
  const names = members.map((member) => member.display_name).join(", ");
  return (
    <span
      role="img"
      aria-label={names || "No members"}
      className={cn("inline-flex items-center", className)}
    >
      {shown.map((member) => {
        const avatar = (
          <PersonAvatar
            name={member.display_name}
            src={member.avatar_url}
            className="ring-2 ring-card"
          />
        );
        const place = "relative -ml-2 first:ml-0 hover:z-10";
        if (member.joined_at === undefined) {
          return (
            <span key={member.user_id} className={place}>
              {avatar}
            </span>
          );
        }
        return (
          <Peek
            key={member.user_id}
            trigger={
              <span
                className={cn(
                  place,
                  "rounded-full motion-safe:transition-transform motion-safe:hover:-translate-y-0.5",
                )}
              >
                {avatar}
              </span>
            }
          >
            <MemberDetails member={member} isOwner={member.user_id === ownerId} />
          </Peek>
        );
      })}
      {rest.length > 0 ? (
        <Peek
          trigger={
            <span
              aria-hidden="true"
              className="relative -ml-2 flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-2 ring-card hover:z-10"
            >
              +{rest.length}
            </span>
          }
        >
          <p className="text-sm font-semibold">
            {plural(rest.length, "more person", "more people")}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {rest.map((member) => (
              <li key={member.user_id} className="flex items-center gap-2 text-sm">
                <PersonAvatar name={member.display_name} src={member.avatar_url} size="sm" />
                <span className="truncate">{member.display_name}</span>
              </li>
            ))}
          </ul>
        </Peek>
      ) : null}
    </span>
  );
}
