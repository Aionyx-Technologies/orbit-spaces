"use client";

import { createContext, useContext } from "react";

import type { SpaceMembersProviderProps } from "@/components/space/space-members.types";
import type { Member } from "@/lib/api.types";

const NO_MEMBERS: readonly Member[] = [];

const SpaceMembersContext = createContext<readonly Member[]>(NO_MEMBERS);

export function SpaceMembersProvider({ members, children }: SpaceMembersProviderProps) {
  return <SpaceMembersContext value={members}>{children}</SpaceMembersContext>;
}

export function useSpaceMembers(): readonly Member[] {
  return useContext(SpaceMembersContext);
}
