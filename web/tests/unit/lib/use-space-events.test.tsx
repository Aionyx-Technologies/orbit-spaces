import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSpaceEvents } from "@/lib/use-space-events";
import { SPACE_EVENT_TYPES } from "@/lib/use-space-events.types";
import { FakeEventSource } from "@/tests/unit/helpers/fake-event-source";

function setup(spaceId = "space-1") {
  const handlers = { onEvent: vi.fn(), onResync: vi.fn() };
  const view = renderHook(({ id }) => useSpaceEvents(id, handlers), {
    initialProps: { id: spaceId },
  });
  return { handlers, ...view };
}

describe("useSpaceEvents", () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the stream for the space and starts out connecting", () => {
    const { result } = setup("space 1");

    expect(FakeEventSource.latest.url).toBe("/api/spaces/space%201/events");
    expect(result.current).toBe("connecting");
  });

  it("reports live once open", () => {
    const { result } = setup();

    act(() => FakeEventSource.latest.open());

    expect(result.current).toBe("live");
  });

  it.each(SPACE_EVENT_TYPES)("passes %s events to the handler with parsed data", (type) => {
    const { handlers } = setup();

    act(() => FakeEventSource.latest.emit(type, { space_id: "space-1", item_id: "i1" }));

    expect(handlers.onEvent).toHaveBeenCalledWith({
      type,
      data: { space_id: "space-1", item_id: "i1" },
    });
  });

  it("listens for profile changes, so photos and about lines can update live", () => {
    const { handlers } = setup();
    expect(SPACE_EVENT_TYPES).toContain("profile_changed");

    act(() => FakeEventSource.latest.emit("profile_changed", { user_id: "user-blake" }));

    expect(handlers.onEvent).toHaveBeenCalledWith({
      type: "profile_changed",
      data: { user_id: "user-blake" },
    });
  });

  it("copes with data that is not an object", () => {
    const { handlers } = setup();

    act(() => {
      FakeEventSource.latest.emit("item_added", "not json");
      FakeEventSource.latest.emit("item_added", "42");
      FakeEventSource.latest.emit("item_added", "null");
    });

    expect(handlers.onEvent).toHaveBeenCalledTimes(3);
    for (const [event] of handlers.onEvent.mock.calls) {
      expect(event).toEqual({ type: "item_added", data: {} });
    }
  });

  it("resyncs when the server says the client fell behind", () => {
    const { handlers } = setup();

    act(() => FakeEventSource.latest.emit("resync", {}));

    expect(handlers.onResync).toHaveBeenCalledTimes(1);
  });

  it("stays connecting while the browser retries on its own", () => {
    const { result } = setup();
    act(() => FakeEventSource.latest.open());

    act(() => FakeEventSource.latest.fail({ closed: false }));

    expect(result.current).toBe("connecting");
  });

  it("resyncs once after an automatic reconnect, and not on the first open", () => {
    const { handlers } = setup();
    act(() => FakeEventSource.latest.open());
    expect(handlers.onResync).not.toHaveBeenCalled();

    act(() => FakeEventSource.latest.fail({ closed: false }));
    act(() => FakeEventSource.latest.open());
    act(() => FakeEventSource.latest.open());

    expect(handlers.onResync).toHaveBeenCalledTimes(1);
  });

  it("goes offline when the stream is closed and reconnects with a delay", () => {
    vi.useFakeTimers();
    const { result, handlers } = setup();
    const first = FakeEventSource.latest;

    act(() => first.fail({ closed: true }));
    expect(result.current).toBe("offline");
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(first.closed).toBe(true);
    act(() => FakeEventSource.latest.open());
    expect(result.current).toBe("live");
    expect(handlers.onResync).toHaveBeenCalledTimes(1);
  });

  it("backs off further after repeated failures", () => {
    vi.useFakeTimers();
    setup();

    act(() => FakeEventSource.latest.fail({ closed: true }));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    act(() => FakeEventSource.latest.fail({ closed: true }));
    act(() => {
      vi.advanceTimersByTime(3_999);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it("uses the latest handlers without reconnecting", () => {
    const first = { onEvent: vi.fn(), onResync: vi.fn() };
    const second = { onEvent: vi.fn(), onResync: vi.fn() };
    const { rerender } = renderHook(({ handlers }) => useSpaceEvents("space-1", handlers), {
      initialProps: { handlers: first },
    });

    rerender({ handlers: second });
    act(() => FakeEventSource.latest.emit("memory_set", { space_id: "space-1" }));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(first.onEvent).not.toHaveBeenCalled();
    expect(second.onEvent).toHaveBeenCalledTimes(1);
  });

  it("reconnects when the space changes", () => {
    const { rerender } = setup("space-1");
    const first = FakeEventSource.latest;

    rerender({ id: "space-2" });

    expect(first.closed).toBe(true);
    expect(FakeEventSource.latest.url).toBe("/api/spaces/space-2/events");
  });

  it("closes the stream and removes its listeners on unmount", () => {
    const { unmount } = setup();
    const source = FakeEventSource.latest;
    expect(source.listenerCount("item_added")).toBe(1);

    unmount();

    expect(source.closed).toBe(true);
    expect(source.listenerCount("item_added")).toBe(0);
    expect(source.listenerCount("resync")).toBe(0);
  });
});
