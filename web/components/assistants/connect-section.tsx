"use client";

import { useState } from "react";

import { AssistantMark } from "@/components/brand/assistant-mark";
import { ConnectNotice } from "@/components/assistants/connect-notice";
import { CopyButton } from "@/components/common/copy-button";
import { SetupPromptActions } from "@/components/common/setup-prompt-actions";
import type {
  AssistantGuide,
  ConnectNoticeState,
  ConnectSectionProps,
} from "@/components/assistants/connect-section.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ASSISTANT_LINKS, connectorTarget } from "@/lib/assistant-links";
import type { AssistantLink } from "@/lib/assistant-links.types";
import { assistantKey } from "@/lib/assistants";
import { copyText } from "@/lib/clipboard";
import { useConnections } from "@/lib/queries";

const GUIDES: AssistantGuide[] = [
  {
    name: "ChatGPT",
    steps: [
      "Open ChatGPT settings and find Connectors. If you cannot add your own, turn on developer mode first.",
      "Add a custom connector, call it Orbit and paste the address above.",
      "Choose sign-in with OAuth if it asks, then sign in to Orbit and press Allow.",
      "In a chat, say “share this to Orbit” to try it.",
    ],
  },
  {
    name: "Grok",
    steps: [
      "Open Grok settings and find Connectors.",
      "Add a custom connector, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “Save our hotel shortlist to Orbit.”",
    ],
  },
  {
    name: "Claude",
    steps: [
      "Open Claude settings, then Connectors.",
      "Choose Add custom connector, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “What did we share in Orbit?”",
    ],
  },
  {
    name: "Muse",
    steps: [
      "Open Muse settings and find where it adds connectors or MCP servers.",
      "Add a remote MCP server, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “Share this to Orbit.”",
    ],
  },
  {
    name: "OpenClaw",
    steps: [
      "Open your OpenClaw settings or config and find the MCP servers section.",
      "Add a remote MCP server, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “What did we share in Orbit?”",
    ],
  },
  {
    name: "Hermes Agent",
    steps: [
      "Open your Hermes Agent config and find the MCP servers section.",
      "Add a remote MCP server, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “Save our hotel shortlist to Orbit.”",
    ],
  },
  {
    name: "Wabi",
    steps: [
      "Open Wabi settings and find where it adds connectors or MCP servers.",
      "Add a remote MCP server, call it Orbit and paste the address above.",
      "Sign in to Orbit when it asks and press Allow.",
      "Try it: “What is new in Orbit?”",
    ],
  },
];

export function ConnectSection({ mcpUrl, initialConnections }: ConnectSectionProps) {
  const { data } = useConnections(initialConnections);
  const connections = (data ?? initialConnections).connections;
  const connectedKeys = new Set(
    connections.map((connection) => assistantKey(connection.client_name)),
  );
  const available = GUIDES.filter((guide) => !connectedKeys.has(assistantKey(guide.name)));
  const [notice, setNotice] = useState<ConnectNoticeState | null>(null);

  async function connect(link: AssistantLink) {
    const copying = copyText(mcpUrl);
    const target = connectorTarget(link, mcpUrl);
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
    const copied = await copying;
    setNotice((previous) => ({ link, copied, attempt: (previous?.attempt ?? 0) + 1 }));
  }

  return (
    <Card aria-labelledby="connect-title" role="region">
      <CardHeader>
        <CardTitle id="connect-title">Connect an assistant</CardTitle>
        <CardDescription>
          Add this address as a custom connector in your assistant. You sign in once and choose
          Allow. Nothing is shared until you ask your assistant to share it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
          <p className="text-base font-medium">Let your assistant do it</p>
          <p className="text-sm text-pretty text-muted-foreground">
            Copy this prompt and paste it into a new chat with your assistant. It connects Orbit
            where it can and tells you which buttons to press where it cannot.
          </p>
          <SetupPromptActions mcpUrl={mcpUrl} guideHref="/setup" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="connector-address">Orbit connector address</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="connector-address"
              readOnly
              value={mcpUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-[0.9375rem]"
            />
            <CopyButton value={mcpUrl} label="Copy address" />
          </div>
        </div>
        {available.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Every assistant listed here is connected. Use the address above for any other.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {available.map((guide) => {
              const link = ASSISTANT_LINKS.find((candidate) => candidate.name === guide.name);
              return (
                <li key={guide.name} className="flex items-start gap-3 px-4 py-3">
                  <details className="group min-w-0 flex-1">
                    <summary className="flex min-h-9 w-full items-center gap-3 rounded-sm text-base font-medium">
                      <AssistantMark name={guide.name} className="size-6" />
                      {guide.name}
                    </summary>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-base text-muted-foreground marker:text-foreground">
                      {guide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                  {link ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Connect ${link.name}`}
                      onClick={() => void connect(link)}
                    >
                      Connect
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {notice ? (
          <ConnectNotice
            key={notice.attempt}
            link={notice.link}
            mcpUrl={mcpUrl}
            copied={notice.copied}
            onDismiss={() => setNotice(null)}
          />
        ) : null}
        <p className="text-sm text-muted-foreground">
          Menus change often. The address above is the only thing you need.
        </p>
      </CardContent>
    </Card>
  );
}
