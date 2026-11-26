import type { AssistantKey, SourceTone } from "@/lib/assistants.types";
import { hashString } from "@/lib/hash";

// First match wins, so "codex" sits before "openai" to give "OpenAI Codex" its own logo.
const LOGO_ASSISTANTS: readonly (readonly [string, AssistantKey])[] = [
  ["codex", "codex"],
  ["chatgpt", "chatgpt"],
  ["openai", "chatgpt"],
  ["claude", "claude"],
  ["anthropic", "claude"],
  ["grok", "grok"],
  ["cursor", "cursor"],
  ["muse", "muse"],
  ["openclaw", "openclaw"],
  ["open claw", "openclaw"],
  ["hermes", "hermes"],
  ["wabi", "wabi"],
];

const KNOWN_ASSISTANTS: readonly (readonly [string, SourceTone])[] = [
  ["codex", { hue: 270, chroma: 0.03 }],
  ["chatgpt", { hue: 172, chroma: 0.13 }],
  ["openai", { hue: 172, chroma: 0.13 }],
  ["claude", { hue: 45, chroma: 0.14 }],
  ["grok", { hue: 270, chroma: 0.03 }],
  ["cursor", { hue: 270, chroma: 0.03 }],
  ["muse", { hue: 255, chroma: 0.17 }],
  ["openclaw", { hue: 25, chroma: 0.17 }],
  ["open claw", { hue: 25, chroma: 0.17 }],
  ["hermes", { hue: 280, chroma: 0.02 }],
  ["wabi", { hue: 90, chroma: 0.02 }],
  ["gemini", { hue: 258, chroma: 0.15 }],
  ["copilot", { hue: 215, chroma: 0.13 }],
  ["perplexity", { hue: 200, chroma: 0.12 }],
  ["mistral", { hue: 58, chroma: 0.15 }],
];

const WEB_TONE: SourceTone = { hue: 277, chroma: 0.17 };
const FALLBACK_CHROMA = 0.13;

export function assistantKey(name: string): AssistantKey | null {
  const lowered = name.trim().toLowerCase();
  return LOGO_ASSISTANTS.find(([fragment]) => lowered.includes(fragment))?.[1] ?? null;
}

export function sourceTone(name: string): SourceTone {
  const lowered = name.trim().toLowerCase();
  if (lowered === "web") {
    return WEB_TONE;
  }
  const known = KNOWN_ASSISTANTS.find(([key]) => lowered.includes(key));
  if (known) {
    return known[1];
  }
  return { hue: hashString(lowered) % 360, chroma: FALLBACK_CHROMA };
}

export function sourceLabel(via: string): string {
  const trimmed = via.trim();
  if (trimmed.toLowerCase() === "web") {
    return "Web";
  }
  return trimmed === "" ? "Unknown" : trimmed;
}

export function toneVars(tone: SourceTone): Record<string, number> {
  return { "--h": tone.hue, "--c": tone.chroma };
}

export function personTone(userId: string): SourceTone {
  return { hue: hashString(userId) % 360, chroma: 0.12 };
}
