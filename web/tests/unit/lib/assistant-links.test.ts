import { describe, expect, it } from "vitest";

import { ASSISTANT_LINKS, connectorTarget } from "@/lib/assistant-links";
import type { AssistantLink } from "@/lib/assistant-links.types";
import { assistantKey } from "@/lib/assistants";

const MCP_URL = "https://orbit.example.com/mcp";

describe("ASSISTANT_LINKS", () => {
  it("has one entry for each assistant with a logo, in the order the page lists them", () => {
    expect(ASSISTANT_LINKS.map((link) => link.name)).toEqual([
      "ChatGPT",
      "Grok",
      "Claude",
      "Muse",
      "OpenClaw",
      "Hermes Agent",
      "Wabi",
    ]);
    expect(new Set(ASSISTANT_LINKS.map((link) => link.key)).size).toBe(ASSISTANT_LINKS.length);
  });

  it("keys each entry by the assistant its name resolves to", () => {
    for (const link of ASSISTANT_LINKS) {
      expect(assistantKey(link.name)).toBe(link.key);
    }
  });

  it("points ChatGPT, Grok and Claude at an https connectors page and explains the next step", () => {
    const withPage = ASSISTANT_LINKS.filter((link) => link.connectorsUrl !== undefined);

    expect(withPage.map((link) => link.name)).toEqual(["ChatGPT", "Grok", "Claude"]);
    for (const link of withPage) {
      expect(new URL(link.connectorsUrl ?? "").protocol).toBe("https:");
      expect(link.instruction).toMatch(/paste/i);
      expect(link.instruction).toContain("If it asks you to sign in, do that first");
    }
  });

  it("gives the other assistants no page to open, only steps for pasting the address", () => {
    const withoutPage = ASSISTANT_LINKS.filter((link) => link.connectorsUrl === undefined);

    expect(withoutPage.map((link) => link.name)).toEqual([
      "Muse",
      "OpenClaw",
      "Hermes Agent",
      "Wabi",
    ]);
    for (const link of withoutPage) {
      expect(link.instruction).toMatch(/remote MCP server named Orbit and paste/);
    }
  });

  it("uses no pre-filled link until one has been checked by hand", () => {
    expect(ASSISTANT_LINKS.filter((link) => link.prefill !== undefined)).toEqual([]);
  });
});

describe("connectorTarget", () => {
  const plain: AssistantLink = {
    key: "claude",
    name: "Claude",
    connectorsUrl: "https://claude.ai/settings/connectors",
    instruction: "Paste it.",
  };

  it("opens the connectors page when there is no pre-fill pattern", () => {
    expect(connectorTarget(plain, MCP_URL)).toBe("https://claude.ai/settings/connectors");
  });

  it("fills the name and the encoded address into a pre-fill pattern", () => {
    const prefilled: AssistantLink = {
      ...plain,
      prefill: "https://claude.ai/add?name={name}&url={address}&again={address}",
    };

    expect(connectorTarget(prefilled, MCP_URL)).toBe(
      "https://claude.ai/add?name=Orbit&url=https%3A%2F%2Forbit.example.com%2Fmcp&again=https%3A%2F%2Forbit.example.com%2Fmcp",
    );
  });

  it("has nothing to open for an assistant without a connectors page", () => {
    const withoutPage: AssistantLink = { key: "muse", name: "Muse", instruction: "Paste it." };

    expect(connectorTarget(withoutPage, MCP_URL)).toBeNull();
  });

  it("falls back to the connectors page for an empty pattern", () => {
    expect(connectorTarget({ ...plain, prefill: "" }, MCP_URL)).toBe(plain.connectorsUrl);
  });
});
