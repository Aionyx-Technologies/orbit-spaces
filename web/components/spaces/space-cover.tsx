import type { SpaceCoverProps } from "@/components/spaces/space-cover.types";
import { COVER_CENTER_X, COVER_CENTER_Y, COVER_HEIGHT, COVER_WIDTH } from "@/lib/cover-art";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

const HALOS = [
  { scale: 2.6, opacity: 0.07 },
  { scale: 1.9, opacity: 0.12 },
  { scale: 1.4, opacity: 0.2 },
] as const;

export function SpaceCover({ art, className }: SpaceCoverProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="space-cover"
      className={cn("cover relative overflow-hidden", className)}
      style={cssVars({ "--h": art.hue })}
    >
      <svg
        viewBox={`0 0 ${COVER_WIDTH} ${COVER_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        focusable="false"
      >
        <g transform={`rotate(${art.tilt} ${COVER_CENTER_X} ${COVER_CENTER_Y})`}>
          {art.rings.map((ring) => (
            <ellipse
              key={ring.rx}
              className="cover-ring"
              cx={COVER_CENTER_X}
              cy={COVER_CENTER_Y}
              rx={ring.rx}
              ry={ring.ry}
            />
          ))}
          {art.satellites.map((satellite) => (
            <circle
              key={satellite.key}
              className="satellite source-fill"
              r={satellite.radius}
              data-kind={satellite.kind}
              style={cssVars({
                "--a0": `${satellite.angle}deg`,
                "--rx": satellite.rx,
                "--ry": satellite.ry,
                "--dur": `${satellite.duration}s`,
                "--h": satellite.hue,
                "--c": satellite.chroma,
              })}
            />
          ))}
        </g>
        {art.empty ? (
          <circle
            className="cover-ring"
            cx={COVER_CENTER_X}
            cy={COVER_CENTER_Y}
            r={art.coreRadius}
            strokeDasharray="3 5"
          />
        ) : (
          <g className="cover-core">
            {HALOS.map((halo) => (
              <circle
                key={halo.scale}
                cx={COVER_CENTER_X}
                cy={COVER_CENTER_Y}
                r={art.coreRadius * halo.scale}
                opacity={halo.opacity}
              />
            ))}
            <circle cx={COVER_CENTER_X} cy={COVER_CENTER_Y} r={art.coreRadius} />
          </g>
        )}
      </svg>
    </div>
  );
}
