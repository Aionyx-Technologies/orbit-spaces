import type { ReactNode } from "react";

export type EmptyStateProps = Readonly<{
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
}>;
