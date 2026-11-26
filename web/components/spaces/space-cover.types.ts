import type { CoverArt } from "@/lib/cover-art.types";

export type SpaceCoverProps = Readonly<{
  art: CoverArt;
  className?: string;
}>;

export type InviteCoverProps = Readonly<{
  className?: string;
}>;
