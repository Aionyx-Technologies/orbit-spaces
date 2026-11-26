"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MOVED_ANCHORS: readonly string[] = [
  "#connect-title",
  "#connections-title",
  "#connector-address",
];

export function AssistantsAnchorRedirect() {
  const router = useRouter();

  useEffect(() => {
    function sendOnIfMoved() {
      if (MOVED_ANCHORS.includes(window.location.hash)) {
        router.replace(`/assistants${window.location.hash}`);
      }
    }
    sendOnIfMoved();
    window.addEventListener("hashchange", sendOnIfMoved);
    return () => window.removeEventListener("hashchange", sendOnIfMoved);
  }, [router]);

  return null;
}
