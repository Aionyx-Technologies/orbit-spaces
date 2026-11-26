import type { ExplicitTheme, ThemeChoice } from "@/lib/theme.types";

export const THEME_COOKIE = "orbit-theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseTheme(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function themeAttribute(choice: ThemeChoice): ExplicitTheme | undefined {
  return choice === "system" ? undefined : choice;
}

export function themeCookie(choice: ThemeChoice, secure: boolean): string {
  const lifetime = choice === "system" ? 0 : ONE_YEAR_SECONDS;
  const parts = [`${THEME_COOKIE}=${choice}`, "Path=/", "SameSite=Lax", `Max-Age=${lifetime}`];
  return (secure ? [...parts, "Secure"] : parts).join("; ");
}
