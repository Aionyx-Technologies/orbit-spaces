import type { AssistantKey } from "@/lib/assistants.types";

export type AssistantGlyphProps = Readonly<{
  assistant: AssistantKey;
}>;

export type AssistantLogoProps = Readonly<{
  assistant: AssistantKey;
  title?: string;
  className?: string;
}>;

export type AssistantMarkProps = Readonly<{
  name: string;
  title?: string;
  className?: string;
}>;
