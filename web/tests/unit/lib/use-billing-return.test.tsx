import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBillingReturn } from "@/lib/use-billing-return";
import { makeBilling, makeMe } from "@/tests/unit/helpers/fixtures";
import { jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const BILLING_URL = "/api/billing";
const ME_URL = "/api/me";

function Probe({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  useBillingReturn(enabled);
  return null;
}

function routes(serve: () => ReturnType<typeof makeBilling> = () => makeBilling()) {
  return mockFetch({
    [`GET ${BILLING_URL}`]: () => jsonResponse(serve()),
    [`GET ${ME_URL}`]: jsonResponse(makeMe({ billing_enabled: true })),
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  toast.mockClear();
  toast.success.mockClear();
  window.history.replaceState(null, "", "/spaces");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useBillingReturn", () => {
  it("shows a success toast once and cleans the query", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/spaces?tab=shared&billing=success");
    routes();

    renderWithProviders(<Probe />);

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(
      "Thanks, your purchase is being processed. It can take a moment to show up.",
    );
    expect(window.location.search).toBe("?tab=shared");
  });

  it("shows the cancelled toast and does not poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/settings?billing=cancelled");
    const fetchMock = routes();

    renderWithProviders(<Probe />);
    await advance(30000);

    expect(toast).toHaveBeenCalledWith("Checkout cancelled. You have not been charged.");
    expect(window.location.search).toBe("");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("polls me and billing at 3, 8 and 15 seconds, then stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/spaces?billing=success");
    const fetchMock = routes();
    const gets = () => fetchMock.callsTo("GET", BILLING_URL).length;

    renderWithProviders(<Probe />);
    await waitFor(() => expect(gets()).toBe(1));
    await advance(3100);
    await waitFor(() => expect(gets()).toBe(2));
    await advance(5000);
    await waitFor(() => expect(gets()).toBe(3));
    await advance(7000);
    await waitFor(() => expect(gets()).toBe(4));
    await advance(30000);

    expect(gets()).toBe(4);
    expect(fetchMock.callsTo("GET", ME_URL).length).toBeGreaterThanOrEqual(4);
  });

  it("stops early once the plan or pack credits change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/spaces?billing=success");
    let served = 0;
    const fetchMock = routes(() => {
      served += 1;
      return served === 1 ? makeBilling() : makeBilling({ plan: "plus", can_manage: true });
    });

    renderWithProviders(<Probe />);
    await waitFor(() => expect(served).toBe(1));
    await advance(3100);
    await waitFor(() => expect(served).toBe(2));
    await advance(30000);

    expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(2);
  });

  it("stops polling when the page goes away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/spaces?billing=success");
    const fetchMock = routes();
    const { unmount } = renderWithProviders(<Probe />);
    await waitFor(() => expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(1));

    unmount();
    await advance(30000);

    expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(1);
  });

  it("does nothing without the query or when disabled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = routes();
    renderWithProviders(<Probe />);
    window.history.replaceState(null, "", "/spaces?billing=success");
    renderWithProviders(<Probe enabled={false} />);

    await advance(30000);

    expect(toast.success).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?billing=success");
    expect(fetchMock.calls).toHaveLength(0);
  });
});
