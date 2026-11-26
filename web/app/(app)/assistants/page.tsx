import type { Metadata } from "next";

import { AssistantsScreen } from "@/components/assistants/assistants-screen";
import { AppShell } from "@/components/layout/app-shell";
import type { ConnectionsResponse, Me } from "@/lib/api.types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Assistants" };

export default async function AssistantsPage() {
  const [me, connections] = await Promise.all([
    serverGet<Me>("/api/me", "/assistants"),
    serverGet<ConnectionsResponse>("/api/connections", "/assistants"),
  ]);
  return (
    <AppShell me={me} current="assistants" width="narrow">
      <AssistantsScreen me={me} initialConnections={connections} />
    </AppShell>
  );
}
