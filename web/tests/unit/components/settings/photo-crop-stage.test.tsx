import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhotoCropStage } from "@/components/settings/photo-crop-stage";
import { startingView } from "@/lib/avatar-crop";
import type { LoadedPhoto } from "@/lib/avatar-file.types";
import { renderPlain } from "@/tests/unit/helpers/render";

const SIZE = { width: 1200, height: 800 };
const PHOTO: LoadedPhoto = {
  src: "data:image/png;base64,AAAA",
  image: document.createElement("img"),
  size: SIZE,
  type: "image/png",
};

function setup(overrides: { loaded?: boolean } = {}) {
  const { loaded = true } = overrides;
  const onMove = vi.fn();
  const onZoomBy = vi.fn();
  const view = renderPlain(
    <PhotoCropStage
      photo={loaded ? PHOTO : null}
      view={loaded ? startingView(SIZE) : null}
      emptyText="Loading photo…"
      onMove={onMove}
      onZoomBy={onZoomBy}
    />,
  );
  const stage = screen.getByRole("group", { name: "Photo crop area" });
  return { ...view, stage, onMove, onZoomBy };
}

describe("PhotoCropStage", () => {
  it("shows the picture placed for the current view and can be reached by keyboard", () => {
    const { container, stage } = setup();

    const picture = container.querySelector("img");
    expect(picture).toHaveAttribute("src", PHOTO.src);
    expect(picture).toHaveAttribute("alt", "");
    expect(picture).toHaveStyle({ width: "150%", height: "100%", left: "-25%" });
    expect(stage).toHaveAttribute("tabindex", "0");
  });

  it("says it is loading and stays out of the tab order until there is a picture", () => {
    const { container, stage } = setup({ loaded: false });

    expect(screen.getByText("Loading photo…")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(stage).toHaveAttribute("tabindex", "-1");
  });

  it.each([
    ["ArrowLeft", -0.05, 0],
    ["ArrowRight", 0.05, 0],
    ["ArrowUp", 0, -0.05],
    ["ArrowDown", 0, 0.05],
  ])("moves the picture a little on %s", async (key, sideways, downward) => {
    const { user, stage, onMove } = setup();
    stage.focus();

    await user.keyboard(`{${key}}`);

    expect(onMove).toHaveBeenCalledWith(sideways, downward);
  });

  it.each([
    ["+", 0.25],
    ["=", 0.25],
    ["-", -0.25],
  ])("zooms with the %s key", async (key, change) => {
    const { user, stage, onZoomBy } = setup();
    stage.focus();

    await user.keyboard(key);

    expect(onZoomBy).toHaveBeenCalledWith(change);
  });

  it("leaves other keys alone so Tab and Escape keep working", async () => {
    const { user, stage, onMove, onZoomBy } = setup();
    stage.focus();

    await user.keyboard("a{Escape}");

    expect(onMove).not.toHaveBeenCalled();
    expect(onZoomBy).not.toHaveBeenCalled();
  });

  it("moves the picture as far as the pointer is dragged, measured against the window width", () => {
    const { stage, onMove } = setup();
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ width: 288 } as DOMRect);

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 136, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 136, clientY: 172 });

    expect(onMove).toHaveBeenNthCalledWith(1, 0.125, 0);
    expect(onMove).toHaveBeenNthCalledWith(2, 0, 0.25);
  });

  it("ignores pointer movement when nothing is held down", () => {
    const { stage, onMove } = setup();
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ width: 288 } as DOMRect);

    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 50, clientY: 50 });

    expect(onMove).not.toHaveBeenCalled();
  });

  it("stops following the pointer once it is let go or the touch is cancelled", () => {
    const { stage, onMove } = setup();
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ width: 288 } as DOMRect);

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 90, clientY: 90 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(stage, { pointerId: 2 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 90, clientY: 90 });

    expect(onMove).not.toHaveBeenCalled();
  });

  it("does nothing for a window with no width yet", () => {
    const { stage, onMove } = setup();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 90, clientY: 90 });

    expect(onMove).not.toHaveBeenCalled();
  });

  it("draws a circle guide that assistive technology skips", () => {
    const { stage } = setup();

    const guide = stage.querySelector("[aria-hidden='true']");
    expect(guide).toHaveClass("pointer-events-none");
  });
});
