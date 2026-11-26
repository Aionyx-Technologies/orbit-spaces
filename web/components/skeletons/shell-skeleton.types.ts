import type { ReactNode } from "react";

import type { NavSection } from "@/components/layout/app-header.types";
import type { ShellWidth } from "@/lib/shell.types";

export type ShellSkeletonProps = Readonly<{
  width?: ShellWidth;
  current?: NavSection | null;
  children: ReactNode;
}>;
