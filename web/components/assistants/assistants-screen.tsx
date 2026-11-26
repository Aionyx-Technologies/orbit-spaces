import { ConnectSection } from "@/components/assistants/connect-section";
import { ConnectionsSection } from "@/components/assistants/connections-section";
import { OtherAssistantCard } from "@/components/assistants/other-assistant-card";
import type { AssistantsScreenProps } from "@/components/assistants/assistants-screen.types";

export function AssistantsScreen({ me, initialConnections }: AssistantsScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="heading-page">Assistants</h1>
        <p className="text-base text-muted-foreground">
          Connect the AI assistants you use, and see which ones have access.
        </p>
      </div>
      <ConnectSection mcpUrl={me.mcp_url} initialConnections={initialConnections} />
      <OtherAssistantCard mcpUrl={me.mcp_url} />
      <ConnectionsSection initial={initialConnections} />
    </div>
  );
}
