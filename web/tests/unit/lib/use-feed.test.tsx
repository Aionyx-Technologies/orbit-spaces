import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFeed } from "@/lib/use-feed";
import { makeItem, makeItemsPage } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/s1"),
}));
vi.mock("@/lib/navigation", () => navigation);

function item(id: string, minute: number) {
  return makeItem({
    id,
    title: id,
    created_at: `2026-11-19T10:${String(minute).padStart(2, "0")}:00Z`,
  });
}

describe("useFeed", () => {
  it("starts with the server-rendered page", () => {
    const { result } = renderHook(() =>
      useFeed("s1", makeItemsPage([item("b", 2), item("a", 1)], "a")),
    );

    expect(result.current.items.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports no more pages when the cursor is empty", () => {
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], null)));
    expect(result.current.hasMore).toBe(false);
  });

  it("loads older items with the cursor", async () => {
    const mock = mockFetch({
      "GET /api/spaces/s1/items?limit=20&before=a": jsonResponse(
        makeItemsPage([item("z", 0)], null),
      ),
    });
    const { result } = renderHook(() =>
      useFeed("s1", makeItemsPage([item("b", 2), item("a", 1)], "a")),
    );

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mock.calls).toHaveLength(1);
    expect(result.current.items.map((entry) => entry.id)).toEqual(["b", "a", "z"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("does nothing when there is nothing more to load", async () => {
    const mock = mockFetch({});
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], null)));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mock.calls).toHaveLength(0);
  });

  it("shows a message and keeps the list when loading more fails", async () => {
    mockFetch({
      "GET /api/spaces/s1/items?limit=20&before=a": errorResponse(500, "error", "Trouble loading."),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], "a")));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe("Trouble loading.");
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadingMore).toBe(false);
  });

  it("sends a signed-out person to sign in when loading more", async () => {
    mockFetch({
      "GET /api/spaces/s1/items?limit=20&before=a": errorResponse(
        401,
        "unauthenticated",
        "Sign in",
      ),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], "a")));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fs1");
    expect(result.current.error).toBeNull();
  });

  it("refreshes the first page and reports which items are new", async () => {
    mockFetch({
      "GET /api/spaces/s1/items?limit=20": jsonResponse(
        makeItemsPage([item("c", 3), item("b", 2), item("a", 1)], null),
      ),
    });
    const { result } = renderHook(() =>
      useFeed("s1", makeItemsPage([item("b", 2), item("a", 1)], null)),
    );

    let arrived: string[] = [];
    await act(async () => {
      arrived = await result.current.refresh();
    });

    expect(arrived).toEqual(["c"]);
    expect(result.current.items.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("reports nothing new when the refreshed page matches", async () => {
    mockFetch({
      "GET /api/spaces/s1/items?limit=20": jsonResponse(makeItemsPage([item("a", 1)], null)),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], null)));

    let arrived: string[] = ["x"];
    await act(async () => {
      arrived = await result.current.refresh();
    });

    expect(arrived).toEqual([]);
  });

  it("keeps the current list when a refresh fails", async () => {
    mockFetch({
      "GET /api/spaces/s1/items?limit=20": errorResponse(500, "error", "Trouble"),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], null)));

    let arrived: string[] = ["x"];
    await act(async () => {
      arrived = await result.current.refresh();
    });

    expect(arrived).toEqual([]);
    expect(result.current.items).toHaveLength(1);
  });

  it("redirects to sign in when a refresh is unauthenticated", async () => {
    navigation.navigateTo.mockClear();
    mockFetch({
      "GET /api/spaces/s1/items?limit=20": errorResponse(401, "unauthenticated", "Sign in"),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], null)));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalled());
  });

  it("adds and removes items locally", () => {
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("b", 2)], null)));

    act(() => result.current.add(item("c", 3)));
    expect(result.current.items.map((entry) => entry.id)).toEqual(["c", "b"]);

    act(() => result.current.remove("b"));
    expect(result.current.items.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("does not request a page while one is loading", async () => {
    let release: (response: Response) => void = () => undefined;
    const mock = mockFetch({
      "GET /api/spaces/s1/items?limit=20&before=a": () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const { result } = renderHook(() => useFeed("s1", makeItemsPage([item("a", 1)], "a")));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mock.calls).toHaveLength(1);

    await act(async () => {
      release(jsonResponse(makeItemsPage([], null)));
      await first;
    });
    expect(result.current.loadingMore).toBe(false);
  });
});
