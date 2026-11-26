"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import type { PhotoCropStageProps } from "@/components/settings/photo-crop-dialog.types";
import { KEY_STEP, placement, ZOOM_STEP } from "@/lib/avatar-crop";

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEY_STEP, 0],
  ArrowRight: [KEY_STEP, 0],
  ArrowUp: [0, -KEY_STEP],
  ArrowDown: [0, KEY_STEP],
};

const ZOOM_KEYS: Readonly<Record<string, number>> = {
  "+": ZOOM_STEP,
  "=": ZOOM_STEP,
  "-": -ZOOM_STEP,
};

export function PhotoCropStage({ photo, view, emptyText, onMove, onZoomBy }: PhotoCropStageProps) {
  const [dragFrom, setDragFrom] = useState<{ x: number; y: number } | null>(null);
  const frame = photo && view ? placement(photo.size, view) : null;

  function pressed(event: KeyboardEvent<HTMLDivElement>) {
    const arrow = ARROWS[event.key];
    const zoom = ZOOM_KEYS[event.key];
    if (arrow) {
      event.preventDefault();
      onMove(arrow[0], arrow[1]);
    } else if (zoom !== undefined) {
      event.preventDefault();
      onZoomBy(zoom);
    }
  }

  function dragStarted(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragFrom({ x: event.clientX, y: event.clientY });
  }

  function dragged(event: PointerEvent<HTMLDivElement>) {
    if (dragFrom === null) {
      return;
    }
    const width = event.currentTarget.getBoundingClientRect().width;
    if (width > 0) {
      onMove((event.clientX - dragFrom.x) / width, (event.clientY - dragFrom.y) / width);
    }
    setDragFrom({ x: event.clientX, y: event.clientY });
  }

  return (
    <div
      role="group"
      aria-label="Photo crop area"
      tabIndex={frame ? 0 : -1}
      onKeyDown={pressed}
      onPointerDown={dragStarted}
      onPointerMove={dragged}
      onPointerUp={() => setDragFrom(null)}
      onPointerCancel={() => setDragFrom(null)}
      className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-lg bg-muted select-none focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden active:cursor-grabbing"
    >
      {photo && frame ? (
        <img
          src={photo.src}
          alt=""
          draggable={false}
          className="absolute max-w-none"
          style={frame}
        />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-black/45 [mask-image:radial-gradient(circle,transparent_49.5%,black_50%)]"
      />
    </div>
  );
}
