import type { ReactNode } from "react";

import type { AppHeaderProps, NavSection } from "@/components/layout/app-header.types";
import type { ShellWidth } from "@/lib/shell.types";

export type AppShellProps = Readonly<{
  me: AppHeaderProps["me"];
  current: NavSection | null;
  width?: ShellWidth;
  children: ReactNode;
}>;
