import { PersonAvatar } from "@/components/common/person-avatar";
import { PersonPeek } from "@/components/common/person-peek";
import type { MembersCardProps } from "@/components/space/members-card.types";
import { SpaceEmailSwitch } from "@/components/space/space-email-switch";
import { WaitingInvites } from "@/components/space/waiting-invites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { plural } from "@/lib/format";

export function MembersCard({
  spaceId,
  members,
  ownerId,
  notifyEmail,
  frequency,
  onNotifyChanged,
  invites = [],
  onInvitesChanged,
}: MembersCardProps) {
  return (
    <Card aria-labelledby="members-title" role="region">
      <CardHeader>
        <CardTitle id="members-title">Members</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ul className="flex flex-col gap-3" aria-label={plural(members.length, "member")}>
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-3">
              <PersonPeek member={member} isOwner={member.user_id === ownerId}>
                <PersonAvatar name={member.display_name} src={member.avatar_url} size="lg" />
              </PersonPeek>
              <span className="min-w-0 truncate text-base font-medium">
                {member.display_name}
                {member.is_you ? (
                  <span className="font-normal text-muted-foreground"> (you)</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <WaitingInvites spaceId={spaceId} invites={invites} onChanged={onInvitesChanged} />
        <div className="border-t pt-4">
          <SpaceEmailSwitch
            spaceId={spaceId}
            notifyEmail={notifyEmail}
            frequency={frequency}
            onChanged={onNotifyChanged}
          />
        </div>
      </CardContent>
    </Card>
  );
}
