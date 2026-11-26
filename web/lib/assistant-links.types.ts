import type { AssistantKey } from "@/lib/assistants.types";

export type AssistantLink = Readonly<{
  key: AssistantKey;
  name: string;
  connectorsUrl?: string;
  prefill?: string;
  instruction: string;
}>;
