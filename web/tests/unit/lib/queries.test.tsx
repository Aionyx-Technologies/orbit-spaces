import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";

import { useConnections, useInvitations, useSpace, useSpaces } from "@/lib/queries";
import {
  makeConnection,
  makeFact,
  makeInvitation,
  makeSpaceDetail,
  makeSpaceSummary,
} from "@/tests/unit/helpers/fixtures";
import { jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import type { WrapperProps } from "@/tests/unit/helpers/render.types";

function wrapper({ children }: WrapperProps) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

describe("queries", () => {
  it("serves the server-rendered spaces without fetching on mount", async () => {
    const mock = mockFetch({});
    const initial = { spaces: [makeSpaceSummary()] };

    const { result } = renderHook(() => useSpaces(initial), { wrapper });

    expect(result.current.data).toEqual(initial);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.calls).toHaveLength(0);
  });

  it("serves the server-rendered invitations without fetching on mount", async () => {
    const mock = mockFetch({});
    const initial = { invitations: [makeInvitation()] };

    const { result } = renderHook(() => useInvitations(initial), { wrapper });

    expect(result.current.invitations).toEqual(initial);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.calls).toHaveLength(0);
  });

  it("forgets one invitation without losing the others that came with the page", async () => {
    mockFetch({});
    const initial = {
      invitations: [makeInvitation({ id: "a" }), makeInvitation({ id: "b" })],
    };
    const { result } = renderHook(() => useInvitations(initial), { wrapper });

    await act(async () => {
      await result.current.forget("a");
    });

    expect(result.current.invitations.invitations.map((invitation) => invitation.id)).toEqual([
      "b",
    ]);
  });

  it("serves the server-rendered connections", () => {
    mockFetch({});
    const initial = { connections: [makeConnection()] };

    const { result } = renderHook(() => useConnections(initial), { wrapper });

    expect(result.current.data?.connections[0]?.client_name).toBe("ChatGPT");
  });
});

describe("useSpace", () => {
  it("serves the server-rendered space without fetching on mount", async () => {
    const mock = mockFetch({});

    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });

    expect(result.current.space.name).toBe("Goa trip");
    expect(result.current.error).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.calls).toHaveLength(0);
  });

  it("refetches on demand", async () => {
    const mock = mockFetch({
      "GET /api/spaces/space-1": jsonResponse(makeSpaceDetail({ name: "Renamed" })),
    });
    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.space.name).toBe("Renamed"));
    expect(mock.callsTo("GET", "/api/spaces/space-1")).toHaveLength(1);
  });

  it("reports a failed refetch while still showing the space it has", async () => {
    mockFetch({
      "GET /api/spaces/space-1": new Response(
        JSON.stringify({ error: { code: "not_found", message: "Space not found." } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    });
    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.error).toMatchObject({ status: 404 }));
    expect(result.current.space.name).toBe("Goa trip");
  });

  it("changes the space on screen without a request, even before anything was fetched", async () => {
    const mock = mockFetch({});
    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });

    await act(async () => {
      await result.current.update((current) => ({ ...current, name: "Edited" }));
    });

    expect(result.current.space.name).toBe("Edited");
    expect(mock.calls).toHaveLength(0);
  });

  it("builds each change on the one before it", async () => {
    mockFetch({});
    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });

    await act(async () => {
      await result.current.update((current) => ({ ...current, name: `${current.name} A` }));
    });
    await act(async () => {
      await result.current.update((current) => ({ ...current, name: `${current.name} B` }));
    });

    expect(result.current.space.name).toBe("Goa trip A B");
  });

  it("builds a change on fresh data once it has been fetched", async () => {
    mockFetch({
      "GET /api/spaces/space-1": jsonResponse(
        makeSpaceDetail({ name: "Renamed", memory: [makeFact({ key: "Budget", value: "$1" })] }),
      ),
    });
    const { result } = renderHook(() => useSpace("space-1", makeSpaceDetail()), { wrapper });
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.space.name).toBe("Renamed"));

    await act(async () => {
      await result.current.update((current) => ({
        ...current,
        memory: [...current.memory, makeFact({ key: "Hotel", value: "Seaside Inn" })],
      }));
    });

    expect(result.current.space.name).toBe("Renamed");
    expect(result.current.space.memory.map((fact) => fact.key)).toEqual(["Budget", "Hotel"]);
  });

  it("keeps working after the server-rendered space changes identity", async () => {
    mockFetch({});
    const { result, rerender } = renderHook(({ initial }) => useSpace("space-1", initial), {
      wrapper,
      initialProps: { initial: makeSpaceDetail({ name: "First" }) },
    });

    rerender({ initial: makeSpaceDetail({ name: "Second" }) });
    await act(async () => {
      await result.current.update((current) => ({ ...current, name: `${current.name}!` }));
    });

    expect(result.current.space.name).toBe("Second!");
  });
});
