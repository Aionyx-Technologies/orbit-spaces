"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/use-theme";

const toastTokens = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--line-strong)",
  "--border-radius": "var(--radius-md)",
} as CSSProperties;

function Toaster(props: ToasterProps) {
  const [theme] = useTheme();
  return <Sonner theme={theme} position="bottom-center" style={toastTokens} {...props} />;
}

export { Toaster };
