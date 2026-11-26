import { redirect } from "next/navigation";

import { Landing } from "@/components/landing/landing";
import type { Me } from "@/lib/api.types";
import { readBillingEnabled } from "@/lib/billing-public";
import { readDemo } from "@/lib/demo";
import { readMcpUrl } from "@/lib/mcp-address";
import { serverGetOptional } from "@/lib/server-api";

export default async function HomePage() {
  const me = await serverGetOptional<Me>("/api/me");
  if (me) {
    redirect("/spaces");
  }
  const [demo, mcpUrl, billingEnabled] = await Promise.all([
    readDemo(),
    readMcpUrl(),
    readBillingEnabled(),
  ]);
  return <Landing demo={demo} mcpUrl={mcpUrl} billingEnabled={billingEnabled} />;
}
