import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "orbit:stored-choice";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): readonly [T, (next: T) => void] {
  const read = useCallback(() => {
    const stored = readStored(key);
    return allowed.find((option) => option === stored) ?? fallback;
  }, [allowed, fallback, key]);
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const write = useCallback((next: T) => writeStored(key, next), [key]);
  return [value, write];
}
