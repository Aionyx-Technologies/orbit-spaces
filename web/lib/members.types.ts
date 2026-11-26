import type { Member, SpaceSummary } from "@/lib/api.types";

export type OwnerLookup = Readonly<{
  is_creator: boolean;
  owner_name?: SpaceSummary["owner_name"];
  members: readonly Pick<Member, "user_id" | "display_name" | "is_you">[];
}>;
