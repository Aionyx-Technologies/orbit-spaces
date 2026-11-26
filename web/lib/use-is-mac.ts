import { useSyncExternalStore } from "react";

function subscribeNever(): () => void {
  return () => undefined;
}

function readIsMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

function serverIsMac(): boolean {
  return false;
}

export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNever, readIsMac, serverIsMac);
}
