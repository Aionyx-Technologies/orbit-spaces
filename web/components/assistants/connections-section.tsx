"use client";

import { PlugZapIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AssistantMark } from "@/components/brand/assistant-mark";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RelativeTime } from "@/components/common/relative-time";
import type { ConnectionsSectionProps } from "@/components/assistants/connections-section.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError } from "@/lib/api";
import type { Connection } from "@/lib/api.types";
import { assistantKey } from "@/lib/assistants";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { useConnections } from "@/lib/queries";

export function ConnectionsSection({ initial }: ConnectionsSectionProps) {
  const { data, mutate } = useConnections(initial);
  const connections = (data ?? initial).connections;
  const [revoking, setRevoking] = useState<Connection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!revoking) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.connections.revoke(revoking.id);
      await mutate();
      toast.success(`${revoking.client_name} was disconnected`);
      setRevoking(null);
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card aria-labelledby="connections-title" role="region">
      <CardHeader>
        <CardTitle id="connections-title">Connected assistants</CardTitle>
        <CardDescription>
          These can read and share in your spaces when you ask them to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Nothing is connected yet. Add the address above to an assistant.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {assistantKey(connection.client_name) ? (
                    <AssistantMark
                      name={connection.client_name}
                      className="size-10 ring-1 ring-border"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      <PlugZapIcon aria-hidden="true" className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium">{connection.client_name}</p>
                    <p className="text-sm break-words text-muted-foreground">
                      {connection.client_host} · Connected{" "}
                      <RelativeTime date={connection.connected_at} />
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Revoke ${connection.client_name}`}
                  onClick={() => setRevoking(connection)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
            setError(null);
          }
        }}
        title={revoking ? `Disconnect ${revoking.client_name}?` : "Disconnect assistant?"}
        description="It will stop being able to read or share in your spaces. You can connect it again later."
        confirmLabel="Revoke access"
        pendingLabel="Revoking…"
        destructive
        pending={pending}
        error={error}
        onConfirm={revoke}
      />
    </Card>
  );
}
