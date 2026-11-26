import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/abc?x=1"),
}));

vi.mock("@/lib/navigation", () => navigation);

describe("redirectIfUnauthenticated", () => {
  beforeEach(() => {
    navigation.navigateTo.mockClear();
  });

  it("sends a signed-out person to sign in and returns to the same page", () => {
    const redirected = redirectIfUnauthenticated(new ApiError(401, "unauthenticated", "Sign in"));

    expect(redirected).toBe(true);
    expect(navigation.navigateTo).toHaveBeenCalledWith(
      "/auth/sign-in?next=%2Fspaces%2Fabc%3Fx%3D1",
    );
  });

  it("ignores every other error", () => {
    expect(redirectIfUnauthenticated(new ApiError(500, "error", "Oops"))).toBe(false);
    expect(redirectIfUnauthenticated(new Error("x"))).toBe(false);
    expect(navigation.navigateTo).not.toHaveBeenCalled();
  });
});
