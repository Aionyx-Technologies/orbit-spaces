export type ImageSize = Readonly<{
  width: number;
  height: number;
}>;

export type CropView = Readonly<{
  zoom: number;
  centerX: number;
  centerY: number;
}>;

export type CropRegion = Readonly<{
  x: number;
  y: number;
  side: number;
}>;

export type CropPlacement = Readonly<{
  width: string;
  height: string;
  left: string;
  top: string;
}>;
