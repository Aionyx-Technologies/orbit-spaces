import type { ReactNode } from "react";

import type { Member } from "@/lib/api.types";

export type SpaceMembersProviderProps = Readonly<{
  members: readonly Member[];
  children: ReactNode;
}>;
