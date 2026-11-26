import type { InviteCoverProps } from "@/components/spaces/space-cover.types";
import { COVER_CENTER_X, COVER_CENTER_Y, COVER_HEIGHT, COVER_WIDTH } from "@/lib/cover-art";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

const RINGS = [
  { rx: 118, ry: 66 },
  { rx: 82, ry: 46 },
  { rx: 48, ry: 27 },
] as const;

export function InviteCover({ className }: InviteCoverProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="invite-cover"
      className={cn("cover relative overflow-hidden", className)}
      style={cssVars({ "--h": 70 })}
    >
      <svg
        viewBox={`0 0 ${COVER_WIDTH} ${COVER_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        focusable="false"
      >
        <g transform={`rotate(-14 ${COVER_CENTER_X} ${COVER_CENTER_Y})`}>
          {RINGS.map((ring) => (
            <ellipse
              key={ring.rx}
              className="cover-ring"
              cx={COVER_CENTER_X}
              cy={COVER_CENTER_Y}
              rx={ring.rx}
              ry={ring.ry}
              strokeDasharray="2 6"
            />
          ))}
        </g>
        <circle
          cx={COVER_CENTER_X}
          cy={COVER_CENTER_Y}
          r="9"
          fill="var(--ember)"
          className="origin-center [transform-box:fill-box] motion-safe:animate-beacon"
          opacity="0.5"
        />
        <circle cx={COVER_CENTER_X} cy={COVER_CENTER_Y} r="9" fill="var(--ember)" />
        <circle cx={COVER_CENTER_X} cy={COVER_CENTER_Y} r="3.2" fill="var(--ember-foreground)" />
      </svg>
    </div>
  );
}
