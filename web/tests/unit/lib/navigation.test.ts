import { describe, expect, it, vi } from "vitest";

import { currentPath, navigateTo } from "@/lib/navigation";

describe("navigateTo", () => {
  it("assigns the location", () => {
    const target = { assign: vi.fn() };
    navigateTo("/spaces", target);
    expect(target.assign).toHaveBeenCalledWith("/spaces");
  });
});

describe("currentPath", () => {
  it("includes the path and query string", () => {
    window.history.pushState({}, "", "/spaces/abc?tab=1");
    expect(currentPath()).toBe("/spaces/abc?tab=1");
  });
});
