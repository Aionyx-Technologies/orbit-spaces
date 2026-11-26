import type { ReactNode } from "react";

import type { Member } from "@/lib/api.types";

export type StackMember = Pick<Member, "user_id" | "display_name"> &
  Partial<Pick<Member, "joined_at" | "is_you" | "about" | "avatar_url">>;

export type AvatarStackProps = Readonly<{
  members: StackMember[];
  ownerId?: string | null;
  max?: number;
  className?: string;
}>;

export type PeekProps = Readonly<{
  trigger: ReactNode;
  children: ReactNode;
}>;

export type MemberDetailsProps = Readonly<{
  member: StackMember;
  isOwner: boolean;
}>;
