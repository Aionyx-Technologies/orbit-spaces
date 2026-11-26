import type { LucideIcon } from "lucide-react";

export type SetupGuideProps = Readonly<{
  mcpUrl: string | null;
}>;

export type GuideFeature = Readonly<{
  icon: LucideIcon;
  title: string;
  body: string;
}>;
