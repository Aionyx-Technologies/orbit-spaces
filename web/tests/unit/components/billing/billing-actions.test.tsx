import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingActions } from "@/components/billing/billing-actions";
import type { Billing } from "@/lib/api.types";
import { makeBilling } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("@/lib/navigation", () => navigation);

const CHECKOUT_URL = "/api/billing/checkout";
const PORTAL_URL = "/api/billing/portal";

function setup(billing: Billing = makeBilling(), returnTo?: string) {
  const fetchMock = mockFetch({
    [`POST ${CHECKOUT_URL}`]: jsonResponse({ url: "https://stripe.test/pay" }),
    [`POST ${PORTAL_URL}`]: jsonResponse({ url: "https://stripe.test/portal" }),
  });
  return {
    fetchMock,
    ...renderWithProviders(<BillingActions billing={billing} returnTo={returnTo} />),
  };
}

beforeEach(() => {
  navigation.navigateTo.mockClear();
});

describe("BillingActions", () => {
  it.each([
    ["Upgrade to Plus, $6 a month", "plus_monthly"],
    ["Upgrade to Plus, $60 a year", "plus_yearly"],
    ["Buy 100 AI uses", "ai_pack"],
    ["Buy 500 emails", "email_pack"],
  ])("posts %s and goes to the address Orbit gives back", async (name, product) => {
    const { fetchMock, user } = setup();

    await user.click(screen.getByRole("button", { name }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/pay"),
    );
    expect(fetchMock.callsTo("POST", CHECKOUT_URL)[0]?.json).toEqual({ product });
  });

  it("sends return_to when given", async () => {
    const { fetchMock, user } = setup(makeBilling(), "/spaces?tab=shared");

    await user.click(screen.getByRole("button", { name: "Buy 100 AI uses" }));

    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalled());
    expect(fetchMock.callsTo("POST", CHECKOUT_URL)[0]?.json).toEqual({
      product: "ai_pack",
      return_to: "/spaces?tab=shared",
    });
  });

  it("lists what Plus adds on the Free plan only", () => {
    const first = setup();
    expect(screen.getByText("What Plus adds")).toBeInTheDocument();
    expect(screen.getByText("Unlimited spaces")).toBeInTheDocument();
    expect(screen.getByText("Up to 25 people in each space")).toBeInTheDocument();
    expect(screen.getByText("150 AI uses a month")).toBeInTheDocument();
    expect(screen.getByText("100 instant update emails a day")).toBeInTheDocument();
    first.unmount();

    setup(makeBilling({ plan: "plus" }));
    expect(screen.queryByText("What Plus adds")).not.toBeInTheDocument();
  });

  it("shows Manage subscription only with a billing account", async () => {
    const first = setup(makeBilling({ can_manage: false }));
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
    first.unmount();

    const { user } = setup(makeBilling({ plan: "plus", can_manage: true }));
    await user.click(screen.getByRole("button", { name: "Manage subscription" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/portal"),
    );
  });

  it("sends return_to to the portal when given", async () => {
    const { fetchMock, user } = setup(
      makeBilling({ plan: "plus", can_manage: true }),
      "/spaces?tab=shared",
    );

    await user.click(screen.getByRole("button", { name: "Manage subscription" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/portal"),
    );
    expect(fetchMock.callsTo("POST", PORTAL_URL)[0]?.json).toEqual({
      return_to: "/spaces?tab=shared",
    });
  });

  it("sends nothing extra to the portal without a return page", async () => {
    const { fetchMock, user } = setup(makeBilling({ plan: "plus", can_manage: true }));

    await user.click(screen.getByRole("button", { name: "Manage subscription" }));

    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalled());
    expect(fetchMock.callsTo("POST", PORTAL_URL)[0]?.json).toBeFalsy();
  });

  it("hides the upgrade on Plus and the pack buttons the server does not sell", () => {
    setup(makeBilling({ plan: "plus", ai_pack_available: true, email_pack_available: false }));

    expect(screen.queryByRole("button", { name: /Upgrade to Plus/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy 100 AI uses" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy 500 emails" })).not.toBeInTheDocument();
    expect(screen.queryByText("The yearly plan is 2 months free.")).not.toBeInTheDocument();
  });

  it("says the yearly plan is 2 months free on the free plan", () => {
    setup();

    expect(screen.getByText("The yearly plan is 2 months free.")).toBeInTheDocument();
  });

  it("shows an error and lets the person try again when checkout fails", async () => {
    mockFetch({
      [`POST ${CHECKOUT_URL}`]: errorResponse(502, "billing_unavailable", "Stripe is down."),
    });
    const { user } = renderWithProviders(<BillingActions billing={makeBilling()} />);
    const button = screen.getByRole("button", { name: "Buy 100 AI uses" });

    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("Stripe is down.");
    expect(navigation.navigateTo).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });

  it("frees the buttons when the person comes back from Stripe with Back", async () => {
    const { user } = setup();
    const button = screen.getByRole("button", { name: "Buy 100 AI uses" });
    await user.click(button);
    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalled());
    expect(button).toBeDisabled();

    const fresh = new Event("pageshow");
    Object.defineProperty(fresh, "persisted", { value: false });
    act(() => {
      window.dispatchEvent(fresh);
    });
    expect(button).toBeDisabled();

    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(button).toBeEnabled();
  });
});
