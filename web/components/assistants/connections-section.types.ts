import type { ConnectionsResponse } from "@/lib/api.types";

export type ConnectionsSectionProps = Readonly<{
  initial: ConnectionsResponse;
}>;
