import type { ImageSize } from "@/lib/avatar-crop.types";

export type LoadedPhoto = Readonly<{
  src: string;
  image: HTMLImageElement;
  size: ImageSize;
  type: string;
}>;

export type CroppedPhoto = Readonly<{
  blob: Blob;
  filename: string;
}>;
