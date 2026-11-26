import { AssistantGlyph } from "@/components/brand/assistant-glyph";
import type { HeroOrbitProps } from "@/components/landing/hero-orbit.types";
import { assistantKey, sourceTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

const WIDTH = 1000;
const HEIGHT = 700;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const LOGO_SIZE = 34;

const RINGS = [
  { rx: 470, ry: 250 },
  { rx: 340, ry: 182 },
  { rx: 214, ry: 114 },
] as const;

const SATELLITES = [
  { key: "ChatGPT", ring: 0, angle: 200, duration: 140 },
  { key: "Claude", ring: 1, angle: 40, duration: 110 },
  { key: "Grok", ring: 0, angle: 320, duration: 140 },
  { key: "Muse", ring: 1, angle: 140, duration: 110 },
  { key: "OpenClaw", ring: 0, angle: 20, duration: 140 },
  { key: "Hermes Agent", ring: 1, angle: 330, duration: 110 },
  { key: "Wabi", ring: 0, angle: 140, duration: 140 },
  { key: "Codex", ring: 1, angle: 250, duration: 110 },
  { key: "Cursor", ring: 0, angle: 80, duration: 140 },
] as const;

export function HeroOrbit({ className }: HeroOrbitProps) {
  return (
    <div aria-hidden="true" className={cn("cover pointer-events-none", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        focusable="false"
      >
        <g transform={`rotate(-16 ${CENTER_X} ${CENTER_Y})`}>
          {RINGS.map((ring) => (
            <ellipse
              key={ring.rx}
              className="cover-ring"
              cx={CENTER_X}
              cy={CENTER_Y}
              rx={ring.rx}
              ry={ring.ry}
            />
          ))}
          {SATELLITES.map((satellite) => {
            const ring = RINGS[satellite.ring];
            const assistant = assistantKey(satellite.key);
            const orbit = cssVars({
              ...toneVars(sourceTone(satellite.key)),
              "--a0": `${satellite.angle}deg`,
              "--rx": ring.rx,
              "--ry": ring.ry,
              "--dur": `${satellite.duration}s`,
              "--cx": `${CENTER_X}px`,
              "--cy": `${CENTER_Y}px`,
            });
            if (!assistant) {
              return null;
            }
            return (
              <g
                key={satellite.key}
                data-assistant={assistant}
                className="satellite hero-satellite text-foreground max-sm:hidden"
                style={orbit}
              >
                <g
                  transform={`translate(${-LOGO_SIZE / 2} ${-LOGO_SIZE / 2}) scale(${LOGO_SIZE / 24})`}
                >
                  <AssistantGlyph assistant={assistant} />
                </g>
              </g>
            );
          })}
        </g>
        <g className="cover-core">
          <circle cx={CENTER_X} cy={CENTER_Y} r="120" opacity="0.05" />
          <circle cx={CENTER_X} cy={CENTER_Y} r="84" opacity="0.09" />
          <circle cx={CENTER_X} cy={CENTER_Y} r="52" opacity="0.16" />
          <circle cx={CENTER_X} cy={CENTER_Y} r="26" />
        </g>
      </svg>
    </div>
  );
}
