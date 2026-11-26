import type { AssistantLink } from "@/lib/assistant-links.types";

export const CONNECTOR_NAME = "Orbit";
export const NAME_PLACEHOLDER = "{name}";
export const ADDRESS_PLACEHOLDER = "{address}";

export const ASSISTANT_LINKS: readonly AssistantLink[] = [
  {
    key: "chatgpt",
    name: "ChatGPT",
    connectorsUrl: "https://chatgpt.com/#settings/Connectors",
    instruction:
      "Add a custom connector (MCP), name it Orbit, choose OAuth and paste. If you cannot add your own, turn on developer mode first. If it asks you to sign in, do that first, then open Connectors.",
  },
  {
    key: "grok",
    name: "Grok",
    connectorsUrl: "https://grok.com/connectors",
    instruction:
      "Click New Connector, choose Custom, and paste. If it asks you to sign in, do that first, then open Connectors.",
  },
  {
    key: "claude",
    name: "Claude",
    connectorsUrl: "https://claude.ai/settings/connectors",
    instruction:
      "Click Add, then Add custom connector, name it Orbit and paste. If it asks you to sign in, do that first, then open Connectors.",
  },
  {
    key: "muse",
    name: "Muse",
    instruction:
      "Open Muse settings, find where it adds connectors or MCP servers, add a remote MCP server named Orbit and paste. If it asks you to sign in to Orbit, press Allow.",
  },
  {
    key: "openclaw",
    name: "OpenClaw",
    instruction:
      "Open your OpenClaw settings or config, find the MCP servers section, add a remote MCP server named Orbit and paste. If it asks you to sign in to Orbit, press Allow.",
  },
  {
    key: "hermes",
    name: "Hermes Agent",
    instruction:
      "Open your Hermes Agent config, find the MCP servers section, add a remote MCP server named Orbit and paste. If it asks you to sign in to Orbit, press Allow.",
  },
  {
    key: "wabi",
    name: "Wabi",
    instruction:
      "Open Wabi settings, find where it adds connectors or MCP servers, add a remote MCP server named Orbit and paste. If it asks you to sign in to Orbit, press Allow.",
  },
];

export function connectorTarget(link: AssistantLink, mcpUrl: string): string | null {
  if (!link.prefill) {
    return link.connectorsUrl ?? null;
  }
  return link.prefill
    .replaceAll(NAME_PLACEHOLDER, encodeURIComponent(CONNECTOR_NAME))
    .replaceAll(ADDRESS_PLACEHOLDER, encodeURIComponent(mcpUrl));
}
