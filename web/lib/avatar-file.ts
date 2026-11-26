import { ApiError, describeError } from "@/lib/api";
import { outputSide } from "@/lib/avatar-crop";
import type { CropRegion } from "@/lib/avatar-crop.types";
import type { CroppedPhoto, LoadedPhoto } from "@/lib/avatar-file.types";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/constants";

export const WRONG_TYPE_MESSAGE =
  "Use a JPEG, PNG or WebP picture. GIF and SVG files are not supported.";
export const TOO_LARGE_MESSAGE = "That picture is larger than 5 MB. Choose a smaller one.";
export const UNREADABLE_MESSAGE = "That picture could not be read. Choose a different one.";
export const PREPARE_MESSAGE = "That picture could not be prepared. Choose a different one.";

const JPEG = "image/jpeg";
const PNG = "image/png";
const JPEG_QUALITY = 0.92;
const PAYLOAD_TOO_LARGE = 413;

export function checkPhotoFile(file: Pick<File, "type" | "size">): string | null {
  if (!AVATAR_TYPES.includes(file.type)) {
    return WRONG_TYPE_MESSAGE;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return TOO_LARGE_MESSAGE;
  }
  return null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("unreadable"));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsDataURL(file);
  });
}

function decode(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("undecodable"));
    image.src = source;
  });
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const src = await readAsDataUrl(file);
  const image = await decode(src);
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  if (size.width < 1 || size.height < 1) {
    throw new Error("empty");
  }
  return { src, image, size, type: file.type };
}

function outputKind(sourceType: string): { type: string; filename: string } {
  return sourceType === JPEG
    ? { type: JPEG, filename: "photo.jpg" }
    : { type: PNG, filename: "photo.png" };
}

export function cropPhoto(photo: LoadedPhoto, region: CropRegion): Promise<CroppedPhoto> {
  const side = outputSide(region);
  const { type, filename } = outputKind(photo.type);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.reject(new Error("no canvas"));
  }
  if (type === JPEG) {
    context.fillStyle = "white";
    context.fillRect(0, 0, side, side);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(photo.image, region.x, region.y, region.side, region.side, 0, 0, side, side);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("no blob")) : resolve({ blob, filename })),
      type,
      JPEG_QUALITY,
    );
  });
}

export function describePhotoFailure(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === PAYLOAD_TOO_LARGE) {
    return TOO_LARGE_MESSAGE;
  }
  return describeError(failure, PREPARE_MESSAGE);
}
