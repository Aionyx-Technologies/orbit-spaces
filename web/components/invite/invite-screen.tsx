"use client";

import { PersonAvatar } from "@/components/common/person-avatar";
import { InviteAccept } from "@/components/invite/invite-accept";
import { InviteSignInForm } from "@/components/invite/invite-sign-in-form";
import type { InviteScreenProps } from "@/components/invite/invite-screen.types";
import { InviteUnavailable } from "@/components/invite/invite-unavailable";

export function InviteScreen({ token, invite }: InviteScreenProps) {
  const inviter = invite.invited_by ?? "Someone";

  if (!invite.already_member && invite.status !== "valid") {
    return <InviteUnavailable problem={invite.status} inviter={invite.invited_by} />;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        {invite.invited_by && !invite.already_member ? (
          <PersonAvatar
            name={invite.invited_by}
            src={invite.inviter_avatar_url}
            size="xl"
            className="mb-2"
          />
        ) : null}
        <h1 className="heading-page">
          {invite.already_member
            ? `You are already in ${invite.space_name}`
            : `${inviter} invited you to ${invite.space_name}`}
        </h1>
        {invite.signed_in || invite.already_member ? null : (
          <p className="text-base text-muted-foreground">
            Orbit lets people who use different AI assistants share work. Sign in to join.
          </p>
        )}
      </div>
      {invite.signed_in || invite.already_member ? (
        <InviteAccept
          token={token}
          spaceName={invite.space_name}
          alreadyMember={invite.already_member}
        />
      ) : (
        <InviteSignInForm token={token} />
      )}
    </div>
  );
}
