import { useSyncExternalStore } from "react";

import { applyTheme, readTheme, serverTheme, subscribeTheme } from "@/lib/theme-store";
import type { ThemeChoice } from "@/lib/theme.types";

export function useTheme(): readonly [ThemeChoice, (choice: ThemeChoice) => void] {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return [theme, applyTheme];
}
