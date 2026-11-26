import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo, LogoMark } from "@/components/brand/logo";
import { renderPlain } from "@/tests/unit/helpers/render";

const BRAND_MARK_CIRCLES: Record<"ring" | "core" | "sat", Record<string, string>> = {
  ring: { cx: "16", cy: "16", r: "11", "stroke-width": "2.8" },
  core: { cx: "16", cy: "16", r: "4.1" },
  sat: { cx: "25.12", cy: "9.85", r: "3.5" },
};

function brandCircle(role: "ring" | "core" | "sat"): Record<string, string> {
  return BRAND_MARK_CIRCLES[role];
}

function attributesOf(circle: Element, names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, circle.getAttribute(name)]));
}

describe("Logo", () => {
  it("shows the Orbit name next to a decorative mark", () => {
    const { container } = renderPlain(<Logo />);

    expect(screen.getByText("Orbit")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("passes classes to the wrapper and the mark", () => {
    const { container } = renderPlain(<Logo className="text-2xl" markClassName="size-9" />);

    expect(container.firstElementChild).toHaveClass("text-2xl");
    expect(container.querySelector("svg")).toHaveClass("size-9");
  });

  it("lets the name be tucked away visually without losing it for assistive technology", () => {
    renderPlain(<Logo wordmarkClassName="max-sm:sr-only" />);

    expect(screen.getByText("Orbit")).toHaveClass("max-sm:sr-only");
    expect(screen.getByText("Orbit")).toBeInTheDocument();
  });
});

describe("LogoMark", () => {
  it("is hidden from assistive technology and uses the accent colour", () => {
    const { container } = renderPlain(<LogoMark className="size-4" />);

    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("text-primary", "size-4");
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("draws the ring, core and satellite in the shape of the Orbit brand mark", () => {
    const { container } = renderPlain(<LogoMark />);

    const [ring, core, satellite] = Array.from(container.querySelectorAll("circle"));
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 32 32");
    for (const [circle, role] of [
      [ring, "ring"],
      [core, "core"],
      [satellite, "sat"],
    ] as const) {
      const expected = brandCircle(role);
      expect(Object.keys(expected).length).toBeGreaterThan(2);
      expect(attributesOf(circle, Object.keys(expected))).toEqual(expected);
    }
  });
});
