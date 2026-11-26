export type AssistantKey =
  "chatgpt" | "claude" | "grok" | "muse" | "openclaw" | "hermes" | "wabi" | "cursor" | "codex";

export type SourceTone = Readonly<{
  hue: number;
  chroma: number;
}>;
