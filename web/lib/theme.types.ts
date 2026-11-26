export type ThemeChoice = "system" | "light" | "dark";

export type ExplicitTheme = Exclude<ThemeChoice, "system">;
