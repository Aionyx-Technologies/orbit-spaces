import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpaceScreen } from "@/components/space/space-screen";
import { FakeEventSource } from "@/tests/unit/helpers/fake-event-source";
import { makeItemsPage, makeMe, makeSpaceDetail } from "@/tests/unit/helpers/fixtures";
import { emptyResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const READ_URL = "/api/spaces/space-1/read";
const SPACE_URL = "/api/spaces/space-1";
const FEED_URL = "/api/spaces/space-1/items?limit=20";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/navigation", () => navigation);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

function renderScreen() {
  return renderWithProviders(
    <SpaceScreen me={makeMe()} initialSpace={makeSpaceDetail()} initialFeed={makeItemsPage([])} />,
  );
}

function routes() {
  return mockFetch({
    [`POST ${READ_URL}`]: emptyResponse(),
    [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail()),
    [`GET ${FEED_URL}`]: jsonResponse(makeItemsPage([])),
  });
}

describe("SpaceScreen marking the space read", () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
    setVisibility("visible");
  });

  afterEach(() => {
    setVisibility("visible");
  });

  it("marks the space read once it opens", () => {
    const mock = routes();

    renderScreen();

    expect(mock.callsTo("POST", READ_URL)).toHaveLength(1);
  });

  it.each(["item_added", "plan_added", "memory_set"])(
    "marks it read again when %s arrives while the person is looking",
    (type) => {
      const mock = routes();
      renderScreen();

      act(() => FakeEventSource.latest.emit(type, {}));

      expect(mock.callsTo("POST", READ_URL)).toHaveLength(2);
    },
  );

  it.each(["item_retracted", "member_joined", "template_changed", "invites_changed"])(
    "does not mark it read for %s, which brings nothing new to read",
    (type) => {
      const mock = routes();
      renderScreen();

      act(() => FakeEventSource.latest.emit(type, {}));

      expect(mock.callsTo("POST", READ_URL)).toHaveLength(1);
    },
  );

  it("does not mark it read while the tab is hidden, and does once it is shown again", () => {
    setVisibility("hidden");
    const mock = routes();
    renderScreen();
    act(() => FakeEventSource.latest.emit("item_added", {}));

    expect(mock.callsTo("POST", READ_URL)).toHaveLength(0);

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mock.callsTo("POST", READ_URL)).toHaveLength(1);
  });

  it("stops listening for the tab coming back when the screen goes away", () => {
    const mock = routes();
    const { unmount } = renderScreen();
    unmount();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mock.callsTo("POST", READ_URL)).toHaveLength(1);
  });

  it("sends a signed-out person to sign in when marking read is refused", async () => {
    mockFetch({
      [`POST ${READ_URL}`]: jsonResponse(
        { error: { code: "unauthenticated", message: "Sign in again." } },
        401,
      ),
    });

    renderScreen();

    await vi.waitFor(() => expect(navigation.navigateTo).toHaveBeenCalled());
  });

  it("stays quiet when marking read fails for any other reason", async () => {
    const mock = mockFetch({
      [`POST ${READ_URL}`]: jsonResponse(
        { error: { code: "server_error", message: "Something broke." } },
        500,
      ),
    });
    navigation.navigateTo.mockClear();

    renderScreen();
    await vi.waitFor(() => expect(mock.callsTo("POST", READ_URL)).toHaveLength(1));

    expect(navigation.navigateTo).not.toHaveBeenCalled();
  });
});
