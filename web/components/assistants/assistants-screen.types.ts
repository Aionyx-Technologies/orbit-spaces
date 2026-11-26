import type { ConnectionsResponse, Me } from "@/lib/api.types";

export type AssistantsScreenProps = Readonly<{
  me: Me;
  initialConnections: ConnectionsResponse;
}>;
