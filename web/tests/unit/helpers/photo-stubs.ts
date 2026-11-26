import { vi } from "vitest";

import type { CanvasBehaviour, ImageBehaviour } from "@/tests/unit/helpers/photo-stubs.types";

type Listener = (event: { currentTarget: unknown }) => void;

export function stubImage({ width, height, fails = false }: ImageBehaviour): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    complete = false;
    crossOrigin: string | null = null;
    referrerPolicy = "";
    private listeners: Record<string, Set<Listener>> = { load: new Set(), error: new Set() };

    addEventListener(type: string, listener: Listener): void {
      this.listeners[type]?.add(listener);
    }

    removeEventListener(type: string, listener: Listener): void {
      this.listeners[type]?.delete(listener);
    }

    set src(_value: string) {
      queueMicrotask(() => {
        this.complete = true;
        const type = fails ? "error" : "load";
        if (fails) {
          this.naturalWidth = 0;
          this.onerror?.();
        } else {
          this.onload?.();
        }
        this.listeners[type]?.forEach((listener) => listener({ currentTarget: this }));
      });
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

export function stubCanvas({ context = true, blob = true }: CanvasBehaviour = {}) {
  const drawing = {
    fillStyle: "",
    imageSmoothingQuality: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context ? (drawing as unknown as CanvasRenderingContext2D) : null,
  );
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback, type) => {
      callback(blob ? new Blob(["pixels"], { type }) : null);
    });
  return { drawing, toBlob };
}

export function pictureFile(name = "me.png", type = "image/png", size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}
