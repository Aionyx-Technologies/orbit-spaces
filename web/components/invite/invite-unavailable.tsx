import { LinkIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import type {
  InviteProblem,
  InviteUnavailableProps,
} from "@/components/invite/invite-unavailable.types";
import { buttonVariants } from "@/components/ui/button";

const COPY: Record<InviteProblem, { title: string; text: (inviter: string) => string }> = {
  not_found: {
    title: "This invite link isn't valid",
    text: () => "Check that you copied the whole link, or ask for a new one.",
  },
  expired: {
    title: "This invite has expired",
    text: (inviter) => `Invites work for 7 days. Ask ${inviter} for a new one.`,
  },
  used: {
    title: "This invite was already used",
    text: (inviter) => `Each invite link works once. Ask ${inviter} for a new one.`,
  },
  revoked: {
    title: "This invite is no longer valid",
    text: (inviter) => `Ask ${inviter} for a new one.`,
  },
  error: {
    title: "We couldn't check this invite",
    text: () => "Something went wrong on our side. Try again in a moment.",
  },
};

export function InviteUnavailable({ problem, inviter }: InviteUnavailableProps) {
  const copy = COPY[problem];
  return (
    <EmptyState
      icon={<LinkIcon aria-hidden="true" />}
      title={copy.title}
      headingLevel={1}
      action={
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to Orbit
        </Link>
      }
    >
      {copy.text(inviter ?? "the person who invited you")}
    </EmptyState>
  );
}
