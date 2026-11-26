import { parseTheme, themeAttribute, themeCookie } from "@/lib/theme";
import type { ThemeChoice } from "@/lib/theme.types";

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readTheme(): ThemeChoice {
  return parseTheme(document.documentElement.dataset.theme);
}

export function serverTheme(): ThemeChoice {
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const attribute = themeAttribute(choice);
  if (attribute) {
    root.dataset.theme = attribute;
  } else {
    delete root.dataset.theme;
  }
  document.cookie = themeCookie(choice, window.location.protocol === "https:");
  listeners.forEach((listener) => listener());
}
