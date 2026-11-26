import type { MemberDetailsProps } from "@/components/common/avatar-stack.types";
import { PersonAvatar } from "@/components/common/person-avatar";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";

export function MemberDetails({ member, isOwner }: MemberDetailsProps) {
  return (
    <div className="flex items-start gap-3">
      <PersonAvatar name={member.display_name} src={member.avatar_url} size="lg" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] leading-tight font-semibold">
          <span className="truncate">{member.display_name}</span>
          {member.is_you ? <Badge>You</Badge> : null}
          {isOwner ? <Badge variant="secondary">Owner</Badge> : null}
        </p>
        {member.about ? (
          <p className="mt-1 text-sm break-words text-foreground">{member.about}</p>
        ) : null}
        {member.joined_at ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Joined <RelativeTime date={member.joined_at} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
