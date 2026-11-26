import type { CropPlacement, CropRegion, CropView, ImageSize } from "@/lib/avatar-crop.types";
import { AVATAR_OUTPUT_PX } from "@/lib/constants";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const KEY_STEP = 0.05;
export const ZOOM_STEP = 0.25;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function startingView(size: ImageSize): CropView {
  return { zoom: MIN_ZOOM, centerX: size.width / 2, centerY: size.height / 2 };
}

function sideAt(size: ImageSize, zoom: number): number {
  return Math.min(size.width, size.height) / zoom;
}

export function constrainView(size: ImageSize, view: CropView): CropView {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const half = sideAt(size, zoom) / 2;
  return {
    zoom,
    centerX: clamp(view.centerX, half, size.width - half),
    centerY: clamp(view.centerY, half, size.height - half),
  };
}

export function cropRegion(size: ImageSize, view: CropView): CropRegion {
  const settled = constrainView(size, view);
  const side = sideAt(size, settled.zoom);
  return { x: settled.centerX - side / 2, y: settled.centerY - side / 2, side };
}

export function zoomView(size: ImageSize, view: CropView, zoom: number): CropView {
  return constrainView(size, { ...view, zoom });
}

export function panView(
  size: ImageSize,
  view: CropView,
  sidewaysShare: number,
  downwardShare: number,
): CropView {
  const settled = constrainView(size, view);
  const side = sideAt(size, settled.zoom);
  return constrainView(size, {
    zoom: settled.zoom,
    centerX: settled.centerX - sidewaysShare * side,
    centerY: settled.centerY - downwardShare * side,
  });
}

export function placement(size: ImageSize, view: CropView): CropPlacement {
  const region = cropRegion(size, view);
  const percentPerPixel = 100 / region.side;
  return {
    width: `${size.width * percentPerPixel}%`,
    height: `${size.height * percentPerPixel}%`,
    left: `${-region.x * percentPerPixel}%`,
    top: `${-region.y * percentPerPixel}%`,
  };
}

export function outputSide(region: CropRegion): number {
  return Math.max(1, Math.min(AVATAR_OUTPUT_PX, Math.round(region.side)));
}
