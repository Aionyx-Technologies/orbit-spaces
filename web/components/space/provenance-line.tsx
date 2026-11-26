import { AssistantMark } from "@/components/brand/assistant-mark";
import type { StackMember } from "@/components/common/avatar-stack.types";
import { PersonAvatar } from "@/components/common/person-avatar";
import { PersonPeek } from "@/components/common/person-peek";
import { RelativeTime } from "@/components/common/relative-time";
import type { ProvenanceLineProps } from "@/components/space/provenance-line.types";
import { useSpaceMembers } from "@/components/space/space-members";
import { describeProvenance } from "@/lib/provenance";
import { cn } from "@/lib/utils";

export function ProvenanceLine({ source, createdAt, meId, className }: ProvenanceLineProps) {
  const provenance = describeProvenance(source, meId);
  const members = useSpaceMembers();
  const person = source.person;
  const member = person?.user_id ? members.find((entry) => entry.user_id === person.user_id) : null;
  const photo = member?.avatar_url ?? person?.avatar_url ?? null;
  const name = person?.display_name ?? null;
  const details: StackMember | null =
    !provenance.isOrbit && person?.user_id && name
      ? {
          user_id: person.user_id,
          display_name: member?.display_name ?? name,
          avatar_url: photo,
          about: member?.about ?? "",
          joined_at: member?.joined_at,
          is_you: provenance.isYou,
        }
      : null;
  const avatar = <PersonAvatar name={name} src={photo} orbit={provenance.isOrbit} size="sm" />;
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      {details ? <PersonPeek member={details}>{avatar}</PersonPeek> : avatar}
      <span>
        <span className="font-medium text-foreground">{provenance.who}</span>
        {provenance.isOrbit ? <span aria-hidden="true"> · </span> : " "}
        <AssistantMark
          name={source.via}
          className="mr-1.5 inline-block size-3.5 align-text-bottom"
        />
        {provenance.via}
      </span>
      <span aria-hidden="true">·</span>
      <RelativeTime date={createdAt} />
    </p>
  );
}
