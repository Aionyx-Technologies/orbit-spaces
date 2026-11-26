import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "@/lib/use-now";

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the current time", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.parse("2026-11-19T12:00:00Z"));
  });

  it("ticks every minute by default", () => {
    const { result } = renderHook(() => useNow());

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(Date.parse("2026-11-19T12:01:00Z"));
  });

  it("supports a custom interval", () => {
    const { result } = renderHook(() => useNow(1_000));

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(result.current).toBe(Date.parse("2026-11-19T12:00:03Z"));
  });

  it("stops ticking after unmount", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useNow());

    unmount();

    expect(clear).toHaveBeenCalled();
  });
});
