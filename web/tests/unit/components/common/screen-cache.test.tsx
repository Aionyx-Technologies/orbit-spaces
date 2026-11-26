import { act, renderHook } from "@testing-library/react";
import useSWR, { SWRConfig, useSWRConfig, type Cache } from "swr";
import { describe, expect, it } from "vitest";

import { ScreenCache } from "@/components/common/screen-cache";
import type { WrapperProps } from "@/tests/unit/helpers/render.types";

function pageVisit(appCache: Cache, scoped: boolean) {
  return function Visit({ children }: WrapperProps) {
    return (
      <SWRConfig value={{ provider: () => appCache, errorRetryCount: 7 }}>
        {scoped ? <ScreenCache>{children}</ScreenCache> : children}
      </SWRConfig>
    );
  };
}

function useServerRenderedValue(serverValue: string) {
  const { data, mutate } = useSWR<string>("/api/value", () => "fetched", {
    fallbackData: serverValue,
    revalidateOnMount: false,
  });
  return { data, mutate };
}

describe("ScreenCache", () => {
  it("gives every visit its own cache, apart from the app's", () => {
    const appCache: Cache = new Map();

    const first = renderHook(() => useSWRConfig().cache, { wrapper: pageVisit(appCache, true) });
    const second = renderHook(() => useSWRConfig().cache, { wrapper: pageVisit(appCache, true) });

    expect(first.result.current).not.toBe(appCache);
    expect(second.result.current).not.toBe(first.result.current);
  });

  it("keeps the app-wide SWR options", () => {
    const { result } = renderHook(() => useSWRConfig().errorRetryCount, {
      wrapper: pageVisit(new Map(), true),
    });

    expect(result.current).toBe(7);
  });

  it("lets the server's data win when a page is entered again", async () => {
    const appCache: Cache = new Map();
    const firstVisit = renderHook(() => useServerRenderedValue("from the server, visit 1"), {
      wrapper: pageVisit(appCache, true),
    });
    await act(async () => {
      await firstVisit.result.current.mutate("changed during visit 1", { revalidate: false });
    });
    expect(firstVisit.result.current.data).toBe("changed during visit 1");
    firstVisit.unmount();

    const secondVisit = renderHook(() => useServerRenderedValue("from the server, visit 2"), {
      wrapper: pageVisit(appCache, true),
    });

    expect(secondVisit.result.current.data).toBe("from the server, visit 2");
  });

  it("is needed, because without it an earlier visit's data hides the server's", async () => {
    const appCache: Cache = new Map();
    const firstVisit = renderHook(() => useServerRenderedValue("from the server, visit 1"), {
      wrapper: pageVisit(appCache, false),
    });
    await act(async () => {
      await firstVisit.result.current.mutate("changed during visit 1", { revalidate: false });
    });
    firstVisit.unmount();

    const secondVisit = renderHook(() => useServerRenderedValue("from the server, visit 2"), {
      wrapper: pageVisit(appCache, false),
    });

    expect(secondVisit.result.current.data).toBe("changed during visit 1");
  });
});
