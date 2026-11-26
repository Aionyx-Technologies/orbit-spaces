import type { OwnerLookup } from "@/lib/members.types";

export function ownerIdOf(space: OwnerLookup): string | null {
  if (space.is_creator) {
    return space.members.find((member) => member.is_you)?.user_id ?? null;
  }
  if (!space.owner_name) {
    return null;
  }
  const matches = space.members.filter(
    (member) => !member.is_you && member.display_name === space.owner_name,
  );
  return matches.length === 1 ? matches[0].user_id : null;
}
