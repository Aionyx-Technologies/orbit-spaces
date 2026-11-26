import type { Metadata } from "next";

import { SetupGuide } from "@/components/setup/setup-guide";
import { readMcpUrl } from "@/lib/mcp-address";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up Orbit",
  description:
    "Connect ChatGPT, Claude, Grok or any other assistant to Orbit with one prompt or a few clicks, and see what you can do once it is connected.",
};

export default async function SetupPage() {
  return <SetupGuide mcpUrl={await readMcpUrl()} />;
}
