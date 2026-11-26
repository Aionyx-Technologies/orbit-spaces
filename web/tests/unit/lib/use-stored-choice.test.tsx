import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStoredChoice } from "@/lib/use-stored-choice";

const OPTIONS = ["grid", "list"] as const;

afterEach(() => {
  window.localStorage.clear();
});

describe("useStoredChoice", () => {
  it("starts with the fallback when nothing was saved", () => {
    const { result } = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));
    expect(result.current[0]).toBe("grid");
  });

  it("uses a saved choice", () => {
    window.localStorage.setItem("layout", "list");
    const { result } = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));
    expect(result.current[0]).toBe("list");
  });

  it("ignores a saved value that is not one of the options", () => {
    window.localStorage.setItem("layout", "carousel");
    const { result } = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));
    expect(result.current[0]).toBe("grid");
  });

  it("saves a new choice and updates everything that shows it", () => {
    const first = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));
    const second = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));

    act(() => first.result.current[1]("list"));

    expect(window.localStorage.getItem("layout")).toBe("list");
    expect(first.result.current[0]).toBe("list");
    expect(second.result.current[0]).toBe("list");
  });

  it("keeps working when the browser will not let the page use storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStoredChoice("layout", OPTIONS, "grid"));

    expect(result.current[0]).toBe("grid");
    expect(() => act(() => result.current[1]("list"))).not.toThrow();
    expect(result.current[0]).toBe("grid");
  });
});
