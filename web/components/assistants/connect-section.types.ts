import type { ConnectionsResponse } from "@/lib/api.types";
import type { AssistantLink } from "@/lib/assistant-links.types";

export type ConnectSectionProps = Readonly<{
  mcpUrl: string;
  initialConnections: ConnectionsResponse;
}>;

export type AssistantGuide = Readonly<{
  name: string;
  steps: readonly string[];
}>;

export type ConnectNoticeState = Readonly<{
  link: AssistantLink;
  copied: boolean;
  attempt: number;
}>;
