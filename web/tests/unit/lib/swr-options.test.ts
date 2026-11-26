import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { MAX_RETRIES, RETRY_BASE_MS, swrOptions } from "@/lib/swr-options";
import type { RetryArgs } from "@/tests/unit/lib/swr-options.types";

const redirect = vi.hoisted(() => ({ redirectIfUnauthenticated: vi.fn() }));

vi.mock("@/lib/auth-redirect", () => redirect);

function retry(error: unknown, retryCount: number, revalidate: ReturnType<typeof vi.fn>) {
  const onErrorRetry = swrOptions.onErrorRetry as (...args: RetryArgs) => void;
  onErrorRetry(
    error,
    "key",
    {} as RetryArgs[2],
    revalidate as unknown as RetryArgs[3],
    { retryCount, dedupe: false } as RetryArgs[4],
  );
}

describe("swrOptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects to sign in when a request is unauthenticated", () => {
    const error = new ApiError(401, "unauthenticated", "Sign in");
    (swrOptions.onError as (error: unknown) => void)(error);
    expect(redirect.redirectIfUnauthenticated).toHaveBeenCalledWith(error);
  });

  it("retries server errors with growing delays", () => {
    const revalidate = vi.fn();
    retry(new ApiError(503, "unavailable", "Busy"), 1, revalidate);

    vi.advanceTimersByTime(RETRY_BASE_MS * 2 - 1);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 });
  });

  it("retries network failures", () => {
    const revalidate = vi.fn();
    retry(new ApiError(0, "network", "Offline"), 0, revalidate);
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("never retries client errors", () => {
    const revalidate = vi.fn();
    retry(new ApiError(404, "not_found", "Gone"), 0, revalidate);
    vi.advanceTimersByTime(60_000);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("stops after the maximum number of retries", () => {
    const revalidate = vi.fn();
    retry(new ApiError(500, "error", "Oops"), MAX_RETRIES, revalidate);
    vi.advanceTimersByTime(600_000);
    expect(revalidate).not.toHaveBeenCalled();
  });
});
