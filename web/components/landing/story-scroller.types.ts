import type { ReactNode } from "react";

export type StoryStep = Readonly<{
  title: string;
  body: string;
  hue: number;
  visual: ReactNode;
}>;

export type StoryScrollerProps = Readonly<{
  steps: readonly StoryStep[];
}>;
