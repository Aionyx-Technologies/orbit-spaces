import { personTone, sourceTone } from "@/lib/assistants";
import type { SourceTone } from "@/lib/assistants.types";
import type { CoverArt, CoverRing, CoverSatellite, CoverSource } from "@/lib/cover-art.types";
import { hashString } from "@/lib/hash";

export const COVER_WIDTH = 320;
export const COVER_HEIGHT = 200;
export const COVER_CENTER_X = COVER_WIDTH / 2;
export const COVER_CENTER_Y = COVER_HEIGHT / 2;

const COVER_HUES = [277, 255, 232, 205, 175, 150, 80, 42, 12, 335] as const;
const RINGS: readonly CoverRing[] = [
  { rx: 128, ry: 72 },
  { rx: 96, ry: 54 },
  { rx: 64, ry: 36 },
];
const MAX_PEOPLE = 5;
const MAX_SOURCES = 4;
const MIN_CORE_RADIUS = 12;
const CORE_GROWTH_PER_ITEM = 1.6;
const CORE_GROWTH_ITEMS = 10;
const TILT_SPREAD = 50;
const BASE_DURATION = 44;
const DURATION_STEP = 14;

function satellite(
  ring: CoverRing,
  slot: number,
  key: string,
  kind: CoverSatellite["kind"],
  tone: SourceTone,
): CoverSatellite {
  return {
    key,
    kind,
    angle: hashString(key) % 360,
    rx: ring.rx,
    ry: ring.ry,
    radius: kind === "person" ? 4.5 : 5.5,
    duration: BASE_DURATION + slot * DURATION_STEP,
    hue: tone.hue,
    chroma: tone.chroma,
  };
}

export function buildCoverArt(space: CoverSource): CoverArt {
  const seed = hashString(space.id);
  const people = space.members
    .slice(0, MAX_PEOPLE)
    .map((member, slot) =>
      satellite(
        RINGS[slot % RINGS.length],
        slot,
        `person:${member.user_id}`,
        "person",
        personTone(member.user_id),
      ),
    );
  const assistants = space.sources
    .slice(0, MAX_SOURCES)
    .map((name, slot) =>
      satellite(
        RINGS[(slot + 1) % RINGS.length],
        slot + 1,
        `assistant:${name}`,
        "assistant",
        sourceTone(name),
      ),
    );
  const items = space.note_count + space.fact_count;
  return {
    hue: COVER_HUES[seed % COVER_HUES.length],
    tilt: ((seed >>> 4) % TILT_SPREAD) - TILT_SPREAD / 2,
    coreRadius: MIN_CORE_RADIUS + Math.min(items, CORE_GROWTH_ITEMS) * CORE_GROWTH_PER_ITEM,
    empty: items === 0,
    rings: RINGS,
    satellites: [...people, ...assistants],
  };
}
