import type { ReactNode } from "react";

import type { StackMember } from "@/components/common/avatar-stack.types";

export type PersonPeekProps = Readonly<{
  member: StackMember;
  isOwner?: boolean;
  children: ReactNode;
  className?: string;
}>;
