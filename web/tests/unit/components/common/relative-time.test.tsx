import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RelativeTime } from "@/components/common/relative-time";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("RelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a time element with the exact date as a tooltip", () => {
    renderPlain(<RelativeTime date="2026-11-19T10:00:00Z" />);

    const time = screen.getByText("2 hours ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-19T10:00:00Z");
    expect(time.getAttribute("title")).toMatch(/Nov 19, 2026/);
  });

  it("keeps itself up to date", () => {
    renderPlain(<RelativeTime date="2026-11-19T11:59:30Z" />);
    expect(screen.getByText("just now")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });

  it("passes a class name through", () => {
    renderPlain(<RelativeTime date="2026-11-19T10:00:00Z" className="text-sm" />);
    expect(screen.getByText("2 hours ago")).toHaveClass("text-sm");
  });
});
