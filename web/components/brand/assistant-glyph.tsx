import type { AssistantGlyphProps } from "@/components/brand/assistant-logo.types";
import type { AssistantKey } from "@/lib/assistants.types";
import { CLAUDE_PATH, GROK_PATH, OPENAI_PATH } from "@/lib/assistant-glyphs";

const CLAUDE_TILE = "#D97757";
const CLAUDE_SPARK = "#FAF1EB";

export const RASTER_LOGOS: Readonly<Partial<Record<AssistantKey, string>>> = {
  muse: "/assistants/muse.png",
  openclaw: "/assistants/openclaw.png",
  hermes: "/assistants/hermes.png",
  wabi: "/assistants/wabi.png",
  cursor: "/assistants/cursor.png",
  codex: "/assistants/codex.png",
};

export function AssistantGlyph({ assistant }: AssistantGlyphProps) {
  const raster = RASTER_LOGOS[assistant];
  if (raster) {
    return (
      <>
        <circle cx="12" cy="12" r="12" fill="#FFFFFF" />
        <image
          href={raster}
          x="0"
          y="0"
          width="24"
          height="24"
          preserveAspectRatio="xMidYMid meet"
        />
      </>
    );
  }
  if (assistant === "chatgpt") {
    return (
      <>
        <circle cx="12" cy="12" r="12" fill="var(--card)" />
        <path
          d={OPENAI_PATH}
          fill="currentColor"
          fillRule="evenodd"
          transform="translate(2.16 2.16) scale(0.82)"
        />
      </>
    );
  }
  if (assistant === "claude") {
    return (
      <>
        <rect width="24" height="24" rx="5.4" fill={CLAUDE_TILE} />
        <path
          d={CLAUDE_PATH}
          fill={CLAUDE_SPARK}
          fillRule="evenodd"
          transform="translate(3.36 3.36) scale(0.72)"
        />
      </>
    );
  }
  return (
    <path
      d={GROK_PATH}
      fill="currentColor"
      fillRule="evenodd"
      transform="matrix(1.163 0 0 1.163 -1.956 -1.956)"
    />
  );
}
