import { describe, expect, it } from "vitest";

import {
  constrainView,
  cropRegion,
  MAX_ZOOM,
  MIN_ZOOM,
  outputSide,
  panView,
  placement,
  startingView,
  zoomView,
} from "@/lib/avatar-crop";
import { AVATAR_OUTPUT_PX } from "@/lib/constants";

const LANDSCAPE = { width: 1200, height: 800 };
const PORTRAIT = { width: 600, height: 900 };
const SQUARE = { width: 500, height: 500 };

describe("startingView", () => {
  it("starts unzoomed on the middle of the picture", () => {
    expect(startingView(LANDSCAPE)).toEqual({ zoom: 1, centerX: 600, centerY: 400 });
  });
});

describe("cropRegion", () => {
  it("takes the largest centred square from a landscape picture", () => {
    expect(cropRegion(LANDSCAPE, startingView(LANDSCAPE))).toEqual({ x: 200, y: 0, side: 800 });
  });

  it("takes the largest centred square from a portrait picture", () => {
    expect(cropRegion(PORTRAIT, startingView(PORTRAIT))).toEqual({ x: 0, y: 150, side: 600 });
  });

  it("uses the whole of a square picture when not zoomed", () => {
    expect(cropRegion(SQUARE, startingView(SQUARE))).toEqual({ x: 0, y: 0, side: 500 });
  });

  it("shrinks the square as the picture is zoomed in", () => {
    const view = zoomView(LANDSCAPE, startingView(LANDSCAPE), 2);

    expect(cropRegion(LANDSCAPE, view)).toEqual({ x: 400, y: 200, side: 400 });
  });

  it("never reaches outside the picture, whatever the centre says", () => {
    const wild = { zoom: 2, centerX: -500, centerY: 5000 };

    expect(cropRegion(LANDSCAPE, wild)).toEqual({ x: 0, y: 400, side: 400 });
  });
});

describe("constrainView", () => {
  it("keeps the zoom between the smallest and largest allowed", () => {
    expect(constrainView(LANDSCAPE, { zoom: 0.2, centerX: 600, centerY: 400 }).zoom).toBe(MIN_ZOOM);
    expect(constrainView(LANDSCAPE, { zoom: 40, centerX: 600, centerY: 400 }).zoom).toBe(MAX_ZOOM);
  });

  it("pulls the centre back so the square stays inside", () => {
    const view = constrainView(LANDSCAPE, { zoom: 4, centerX: 0, centerY: 0 });

    expect(view).toEqual({ zoom: 4, centerX: 100, centerY: 100 });
  });

  it("leaves a view that already fits alone", () => {
    const view = { zoom: 2, centerX: 500, centerY: 300 };

    expect(constrainView(LANDSCAPE, view)).toEqual(view);
  });
});

describe("zoomView", () => {
  it("zooms about the current centre", () => {
    const moved = { zoom: 1, centerX: 700, centerY: 400 };

    const zoomed = zoomView(LANDSCAPE, moved, 2);

    expect(zoomed).toEqual({ zoom: 2, centerX: 700, centerY: 400 });
  });

  it("slides the centre in when zooming out would push the square off the picture", () => {
    const corner = { zoom: 4, centerX: 100, centerY: 100 };

    const zoomed = zoomView(LANDSCAPE, corner, 1);

    expect(cropRegion(LANDSCAPE, zoomed)).toEqual({ x: 0, y: 0, side: 800 });
  });

  it("will not zoom past the limits", () => {
    expect(zoomView(LANDSCAPE, startingView(LANDSCAPE), 9).zoom).toBe(MAX_ZOOM);
    expect(zoomView(LANDSCAPE, startingView(LANDSCAPE), 0).zoom).toBe(MIN_ZOOM);
  });
});

describe("panView", () => {
  const zoomed = { zoom: 2, centerX: 600, centerY: 400 };

  it("moves the picture the way it is dragged, so the square moves the other way", () => {
    const right = panView(LANDSCAPE, zoomed, 0.1, 0);
    const down = panView(LANDSCAPE, zoomed, 0, 0.25);

    expect(right.centerX).toBeCloseTo(560);
    expect(right.centerY).toBe(400);
    expect(down.centerX).toBe(600);
    expect(down.centerY).toBeCloseTo(300);
  });

  it("measures a drag in shares of the square, so the picture follows the pointer at any zoom", () => {
    const twice = panView(LANDSCAPE, { zoom: 2, centerX: 600, centerY: 400 }, 0.125, 0);
    const fourTimes = panView(LANDSCAPE, { zoom: 4, centerX: 600, centerY: 400 }, 0.125, 0);

    expect(600 - twice.centerX).toBeCloseTo(50);
    expect(600 - fourTimes.centerX).toBeCloseTo(25);
  });

  it("stops at the edge of the picture", () => {
    const edge = panView(LANDSCAPE, zoomed, 50, 50);

    expect(cropRegion(LANDSCAPE, edge)).toEqual({ x: 0, y: 0, side: 400 });
  });

  it("cannot move at all when the square already fills the shorter side", () => {
    const stuck = panView(SQUARE, startingView(SQUARE), 0.5, 0.5);

    expect(stuck).toEqual(startingView(SQUARE));
  });
});

describe("placement", () => {
  it("positions the picture inside a square window using percentages of that window", () => {
    expect(placement(LANDSCAPE, startingView(LANDSCAPE))).toEqual({
      width: "150%",
      height: "100%",
      left: "-25%",
      top: "0%",
    });
  });

  it("enlarges the picture as it is zoomed", () => {
    const zoomed = zoomView(LANDSCAPE, startingView(LANDSCAPE), 2);

    expect(placement(LANDSCAPE, zoomed)).toEqual({
      width: "300%",
      height: "200%",
      left: "-100%",
      top: "-50%",
    });
  });
});

describe("outputSide", () => {
  it("keeps small crops at their own size", () => {
    expect(outputSide({ x: 0, y: 0, side: 200.4 })).toBe(200);
  });

  it("caps large crops, because the server shrinks them to 256 anyway", () => {
    expect(outputSide({ x: 0, y: 0, side: 4000 })).toBe(AVATAR_OUTPUT_PX);
  });

  it("never returns zero", () => {
    expect(outputSide({ x: 0, y: 0, side: 0.2 })).toBe(1);
  });
});
