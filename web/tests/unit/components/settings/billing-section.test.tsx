import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingSection } from "@/components/settings/billing-section";
import { makeBilling, makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("@/lib/navigation", () => navigation);

const BILLING_URL = "/api/billing";
const CHECKOUT_URL = "/api/billing/checkout";
const PORTAL_URL = "/api/billing/portal";
const ME_URL = "/api/me";

const ON = makeMe({ billing_enabled: true });

function setup(billing = makeBilling(), me = ON) {
  const fetchMock = mockFetch({
    [`GET ${BILLING_URL}`]: jsonResponse(billing),
    [`POST ${CHECKOUT_URL}`]: jsonResponse({ url: "https://stripe.test/pay" }),
    [`POST ${PORTAL_URL}`]: jsonResponse({ url: "https://stripe.test/portal" }),
    [`GET ${ME_URL}`]: jsonResponse(me),
  });
  return { fetchMock, ...renderWithProviders(<BillingSection me={me} />) };
}

async function loaded() {
  return screen.findByRole("region", { name: "Billing" });
}

beforeEach(() => {
  navigation.navigateTo.mockClear();
  window.history.replaceState(null, "", "/settings");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BillingSection", () => {
  it("renders nothing when billing is off", () => {
    const fetchMock = mockFetch({});
    const { container } = renderWithProviders(<BillingSection me={makeMe()} />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("shows the plan and what is left", async () => {
    setup(
      makeBilling({
        plan: "plus",
        period_end: "2026-12-20T00:00:00Z",
        ai_pack_credits: 40,
        email_pack_credits: 250,
        can_manage: true,
      }),
      makeMe({
        billing_enabled: true,
        ai_uses: { limit: 20, used: 5, remaining: 15, resets_at: "2026-12-01T09:00:00Z" },
      }),
    );

    const region = await loaded();
    await waitFor(() => expect(region).toHaveTextContent("Plan: Plus"));
    expect(region).toHaveTextContent("Renews on Dec 20, 2026");
    expect(region).toHaveTextContent("15 of 20 AI uses left");
    expect(region).toHaveTextContent("AI pack uses: 40");
    expect(region).toHaveTextContent("Email credits: 250");
    expect(
      within(region).queryByRole("button", { name: /Upgrade to Plus/ }),
    ).not.toBeInTheDocument();
  });

  it("offers both upgrades on the free plan and hides empty credits", async () => {
    setup();

    const region = await loaded();
    expect(await within(region).findByText("Plan: Free")).toBeInTheDocument();
    expect(
      within(region).getByRole("button", { name: "Upgrade to Plus, $6 a month" }),
    ).toBeEnabled();
    expect(
      within(region).getByRole("button", { name: "Upgrade to Plus, $60 a year" }),
    ).toBeEnabled();
    expect(region).not.toHaveTextContent("AI pack uses");
    expect(region).not.toHaveTextContent("Email credits");
  });

  it.each([
    ["Upgrade to Plus, $6 a month", "plus_monthly"],
    ["Upgrade to Plus, $60 a year", "plus_yearly"],
    ["Buy 100 AI uses", "ai_pack"],
    ["Buy 500 emails", "email_pack"],
  ])("sends the person to Stripe from %s", async (name, product) => {
    const { fetchMock, user } = setup();

    await user.click(await screen.findByRole("button", { name }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/pay"),
    );
    expect(fetchMock.callsTo("POST", CHECKOUT_URL)[0]?.json).toEqual({ product });
  });

  it("shows Manage subscription only with a billing account", async () => {
    const first = setup(makeBilling({ can_manage: false }));
    await screen.findByText("Plan: Free");
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
    first.unmount();

    const { user } = setup(makeBilling({ plan: "plus", can_manage: true }));
    await user.click(await screen.findByRole("button", { name: "Manage subscription" }));
    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/portal"),
    );
  });

  it("shows an error when checkout fails and lets the person try again", async () => {
    mockFetch({
      [`GET ${BILLING_URL}`]: jsonResponse(makeBilling()),
      [`POST ${CHECKOUT_URL}`]: errorResponse(502, "billing_unavailable", "Stripe is down."),
    });
    const { user } = renderWithProviders(<BillingSection me={ON} />);

    const button = await screen.findByRole("button", { name: "Buy 100 AI uses" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("Stripe is down.");
    expect(navigation.navigateTo).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });

  it("says the subscription ends when it is set to cancel", async () => {
    setup(
      makeBilling({
        plan: "plus",
        cancel_at_period_end: true,
        period_end: "2026-12-20T00:00:00Z",
        can_manage: true,
      }),
    );

    expect(await screen.findByText("Ends on Dec 20, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
  });

  it("shows no renewal line on the free plan even with an old period end", async () => {
    setup(makeBilling({ plan: "free", status: "canceled", period_end: "2026-01-20T00:00:00Z" }));

    await screen.findByText("Plan: Free");
    expect(screen.queryByText(/Renews on|Ends on/)).not.toBeInTheDocument();
  });

  it("stops polling when the section goes away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "/settings?billing=success");
    const { fetchMock, unmount } = setup();
    await screen.findByText("Plan: Free");

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(1);
  });

  it("hides a pack the server has no limit for", async () => {
    setup(makeBilling({ ai_pack_available: false, email_pack_available: false }));

    const region = await loaded();
    await within(region).findByText("Plan: Free");
    expect(within(region).queryByRole("button", { name: "Buy 100 AI uses" })).toBeNull();
    expect(within(region).queryByRole("button", { name: "Buy 500 emails" })).toBeNull();
  });

  it("shows each pack the server sells", async () => {
    setup(makeBilling({ ai_pack_available: true, email_pack_available: false }));

    const region = await loaded();
    expect(await within(region).findByRole("button", { name: "Buy 100 AI uses" })).toBeEnabled();
    expect(within(region).queryByRole("button", { name: "Buy 500 emails" })).toBeNull();
  });

  it("leaves the Stripe return message and refreshing to the header", async () => {
    window.history.replaceState(null, "", "/settings?billing=success");
    const { fetchMock } = setup();

    await screen.findByText("Plan: Free");

    expect(screen.queryByText(/Thanks, your purchase is being processed/)).not.toBeInTheDocument();
    expect(window.location.search).toBe("?billing=success");
    expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(1);
  });

  it("shows the same usage meters as the header, from live data", async () => {
    const stale = makeMe({
      billing_enabled: true,
      ai_uses: { limit: 20, used: 5, remaining: 15, resets_at: "2026-12-01T09:00:00Z" },
    });
    const fresh = makeMe({
      billing_enabled: true,
      plan: "plus",
      ai_uses: { limit: 150, used: 38, remaining: 112, resets_at: "2026-12-26T00:00:00Z" },
      instant_emails: { limit: 25, used: 3, remaining: 22 },
    });
    mockFetch({
      [`GET ${BILLING_URL}`]: jsonResponse(makeBilling({ plan: "plus" })),
      [`GET ${ME_URL}`]: jsonResponse(fresh),
    });
    renderWithProviders(<BillingSection me={stale} />);

    const region = await loaded();

    await waitFor(() => expect(region).toHaveTextContent("112 of 150 AI uses left"));
    expect(region).toHaveTextContent("3 of 25 instant emails used today");
    expect(within(region).getByRole("progressbar", { name: "AI uses used" })).toBeInTheDocument();
  });
});
