"use client";

import { CopyButton } from "@/components/common/copy-button";
import type { OtherAssistantCardProps } from "@/components/assistants/other-assistant-card.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SENTENCE = "Add this address as a custom connector (MCP) in your assistant's settings.";

export function OtherAssistantCard({ mcpUrl }: OtherAssistantCardProps) {
  return (
    <Card aria-labelledby="other-assistant-title" role="region">
      <CardHeader>
        <CardTitle id="other-assistant-title">Using a different assistant?</CardTitle>
        <CardDescription>{SENTENCE}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          <Label htmlFor="other-assistant-address">Connector address</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="other-assistant-address"
              readOnly
              value={mcpUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-[0.9375rem]"
            />
            <CopyButton value={mcpUrl} label="Copy" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
