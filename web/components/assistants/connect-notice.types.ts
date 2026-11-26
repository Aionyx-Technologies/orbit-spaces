import type { AssistantLink } from "@/lib/assistant-links.types";

export type ConnectNoticeProps = Readonly<{
  link: AssistantLink;
  mcpUrl: string;
  copied: boolean;
  onDismiss: () => void;
}>;
