import type { SpaceSummary } from "@/lib/api.types";

export type CoverSource = Pick<
  SpaceSummary,
  "id" | "members" | "sources" | "note_count" | "fact_count"
>;

export type CoverRing = Readonly<{
  rx: number;
  ry: number;
}>;

export type CoverSatellite = Readonly<{
  key: string;
  kind: "person" | "assistant";
  angle: number;
  rx: number;
  ry: number;
  radius: number;
  duration: number;
  hue: number;
  chroma: number;
}>;

export type CoverArt = Readonly<{
  hue: number;
  tilt: number;
  coreRadius: number;
  empty: boolean;
  rings: readonly CoverRing[];
  satellites: readonly CoverSatellite[];
}>;
