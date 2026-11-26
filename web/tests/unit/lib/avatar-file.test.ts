import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, GENERIC_MESSAGE, NETWORK_MESSAGE } from "@/lib/api";
import {
  checkPhotoFile,
  cropPhoto,
  describePhotoFailure,
  loadPhoto,
  PREPARE_MESSAGE,
  TOO_LARGE_MESSAGE,
  WRONG_TYPE_MESSAGE,
} from "@/lib/avatar-file";
import type { LoadedPhoto } from "@/lib/avatar-file.types";
import { AVATAR_MAX_BYTES, AVATAR_OUTPUT_PX } from "@/lib/constants";
import { pictureFile, stubCanvas, stubImage } from "@/tests/unit/helpers/photo-stubs";

describe("checkPhotoFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(checkPhotoFile({ type, size: 1000 })).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/plain", ""])(
    "refuses %j with a plain message",
    (type) => {
      expect(checkPhotoFile({ type, size: 1000 })).toBe(WRONG_TYPE_MESSAGE);
    },
  );

  it("accepts a file of exactly 5 MB and refuses one byte more", () => {
    expect(checkPhotoFile({ type: "image/png", size: AVATAR_MAX_BYTES })).toBeNull();
    expect(checkPhotoFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).toBe(
      TOO_LARGE_MESSAGE,
    );
  });

  it("checks the type before the size", () => {
    expect(checkPhotoFile({ type: "image/gif", size: AVATAR_MAX_BYTES + 1 })).toBe(
      WRONG_TYPE_MESSAGE,
    );
  });
});

describe("loadPhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the file as a data address that the page is allowed to show", async () => {
    stubImage({ width: 1200, height: 800 });

    const photo = await loadPhoto(pictureFile());

    expect(photo.src).toMatch(/^data:image\/png;base64,/);
    expect(photo.size).toEqual({ width: 1200, height: 800 });
    expect(photo.type).toBe("image/png");
  });

  it("fails when the browser cannot decode the picture", async () => {
    stubImage({ width: 1, height: 1, fails: true });

    await expect(loadPhoto(pictureFile())).rejects.toThrow();
  });

  it("fails for a picture with no size", async () => {
    stubImage({ width: 0, height: 0 });

    await expect(loadPhoto(pictureFile())).rejects.toThrow();
  });
});

describe("cropPhoto", () => {
  const image = document.createElement("img");

  function photoOf(type: string): LoadedPhoto {
    return { src: "data:", image, size: { width: 1200, height: 800 }, type };
  }

  it("draws the chosen square at the output size and returns a JPEG for a JPEG", async () => {
    const { drawing, toBlob } = stubCanvas();

    const cropped = await cropPhoto(photoOf("image/jpeg"), { x: 100, y: 50, side: 600 });

    expect(drawing.drawImage).toHaveBeenCalledWith(image, 100, 50, 600, 600, 0, 0, 512, 512);
    expect(cropped.filename).toBe("photo.jpg");
    expect(cropped.blob.type).toBe("image/jpeg");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
  });

  it("fills behind a JPEG so transparent areas do not turn black", async () => {
    const { drawing } = stubCanvas();

    await cropPhoto(photoOf("image/jpeg"), { x: 0, y: 0, side: 300 });

    expect(drawing.fillStyle).toBe("white");
    expect(drawing.fillRect).toHaveBeenCalledWith(0, 0, 300, 300);
  });

  it.each(["image/png", "image/webp"])(
    "returns a PNG for %s and keeps transparency",
    async (type) => {
      const { drawing } = stubCanvas();

      const cropped = await cropPhoto(photoOf(type), { x: 0, y: 0, side: 300 });

      expect(cropped.filename).toBe("photo.png");
      expect(cropped.blob.type).toBe("image/png");
      expect(drawing.fillRect).not.toHaveBeenCalled();
    },
  );

  it("caps the size of a big crop", async () => {
    const { drawing } = stubCanvas();

    await cropPhoto(photoOf("image/png"), { x: 0, y: 0, side: 3000 });

    expect(drawing.drawImage).toHaveBeenCalledWith(
      image,
      0,
      0,
      3000,
      3000,
      0,
      0,
      AVATAR_OUTPUT_PX,
      AVATAR_OUTPUT_PX,
    );
  });

  it("fails when the browser gives no drawing surface", async () => {
    stubCanvas({ context: false });

    await expect(cropPhoto(photoOf("image/png"), { x: 0, y: 0, side: 10 })).rejects.toThrow();
  });

  it("fails when the browser cannot make a file from the drawing", async () => {
    stubCanvas({ blob: false });

    await expect(cropPhoto(photoOf("image/png"), { x: 0, y: 0, side: 10 })).rejects.toThrow();
  });
});

describe("describePhotoFailure", () => {
  it("shows the server's own words for a refused picture", () => {
    const failure = new ApiError(422, "invalid", "Animated pictures are not supported.");

    expect(describePhotoFailure(failure)).toBe("Animated pictures are not supported.");
  });

  it("shows the server's words when the daily limit is reached", () => {
    const failure = new ApiError(
      429,
      "rate_limited",
      "You have changed your photo as often as allowed today. Try again tomorrow.",
    );

    expect(describePhotoFailure(failure)).toBe(
      "You have changed your photo as often as allowed today. Try again tomorrow.",
    );
  });

  it("explains a body that was far over the limit, which comes back without a message", () => {
    expect(describePhotoFailure(new ApiError(413, "error", GENERIC_MESSAGE))).toBe(
      TOO_LARGE_MESSAGE,
    );
  });

  it("keeps the network message when Orbit cannot be reached", () => {
    expect(describePhotoFailure(new ApiError(0, "network", NETWORK_MESSAGE))).toBe(NETWORK_MESSAGE);
  });

  it("explains a failure that happened in the browser while preparing the picture", () => {
    expect(describePhotoFailure(new Error("no canvas"))).toBe(PREPARE_MESSAGE);
  });
});
