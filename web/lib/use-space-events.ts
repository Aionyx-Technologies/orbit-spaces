import { useEffect, useRef, useState } from "react";

import {
  SPACE_EVENT_TYPES,
  type ConnectionStatus,
  type SpaceEventHandlers,
  type SpaceEventType,
} from "@/lib/use-space-events.types";

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

function parseData(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function useSpaceEvents(spaceId: string, handlers: SpaceEventHandlers): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [attempt, setAttempt] = useState(0);
  const handlersRef = useRef(handlers);
  const failedBeforeRef = useRef(false);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const source = new EventSource(`/api/spaces/${encodeURIComponent(spaceId)}/events`);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    source.onopen = () => {
      setStatus("live");
      if (failedBeforeRef.current) {
        failedBeforeRef.current = false;
        handlersRef.current.onResync();
      }
    };

    source.onerror = () => {
      failedBeforeRef.current = true;
      if (source.readyState === EventSource.CLOSED) {
        setStatus("offline");
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
        retryTimer = setTimeout(() => setAttempt((current) => current + 1), delay);
      } else {
        setStatus("connecting");
      }
    };

    const listeners = SPACE_EVENT_TYPES.map((type: SpaceEventType) => {
      const listener = (event: Event) => {
        const data = parseData((event as MessageEvent<string>).data);
        handlersRef.current.onEvent({ type, data });
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });

    const onResyncEvent = () => handlersRef.current.onResync();
    source.addEventListener("resync", onResyncEvent);

    return () => {
      clearTimeout(retryTimer);
      for (const { type, listener } of listeners) {
        source.removeEventListener(type, listener);
      }
      source.removeEventListener("resync", onResyncEvent);
      source.close();
    };
  }, [spaceId, attempt]);

  return status;
}
