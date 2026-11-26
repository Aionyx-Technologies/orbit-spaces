import { useCallback, useEffect } from "react";

import { api } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export function useMarkRead(spaceId: string): () => void {
  const markRead = useCallback(() => {
    if (document.visibilityState === "hidden") {
      return;
    }
    api.spaces.markRead(spaceId).catch((failure: unknown) => {
      redirectIfUnauthenticated(failure);
    });
  }, [spaceId]);

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [markRead]);

  return markRead;
}
