"use client";

import { useEffect, useRef } from "react";

import type { ConnectNoticeProps } from "@/components/assistants/connect-notice.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectorTarget } from "@/lib/assistant-links";
import { useIsMac } from "@/lib/use-is-mac";

export function ConnectNotice({ link, mcpUrl, copied, onDismiss }: ConnectNoticeProps) {
  const field = useRef<HTMLInputElement>(null);
  const isMac = useIsMac();
  const target = connectorTarget(link, mcpUrl);

  useEffect(() => {
    if (!copied) {
      field.current?.focus();
      field.current?.select();
    }
  }, [copied]);

  return (
    <output
      aria-label={`Connect ${link.name}`}
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-accent p-4"
    >
      <p className="text-base">
        <span className="font-semibold">
          {copied ? "Address copied." : "Orbit could not copy the address for you."}
        </span>{" "}
        {link.instruction}
      </p>
      {copied ? null : (
        <div className="grid gap-2">
          <Label htmlFor="connect-notice-address">Orbit connector address to copy</Label>
          <Input
            ref={field}
            id="connect-notice-address"
            readOnly
            value={mcpUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-[0.9375rem]"
          />
          <p className="text-sm text-muted-foreground">
            {isMac ? "Press Cmd+C to copy" : "Press Ctrl+C to copy"}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {target ? (
          <a
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open {link.name} connectors
          </a>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </output>
  );
}
