import type { ReactNode } from "react";

export type LegalPageProps = Readonly<{
  title: string;
  updated: string;
  children: ReactNode;
}>;
