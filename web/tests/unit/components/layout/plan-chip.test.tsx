import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
import { PlanChip } from "@/components/layout/plan-chip";
import type { PlanSummary } from "@/lib/api.types";
import { makeBilling, makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces?tab=shared"),
}));

vi.mock("@/lib/navigation", () => navigation);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

const BILLING_URL = "/api/billing";
const ME_URL = "/api/me";
const CHECKOUT_URL = "/api/billing/checkout";

const RESETS = "2026-12-26T00:00:00Z";
const FREE: PlanSummary = {
  plan: "free",
  billing_enabled: true,
  ai_uses: { limit: 20, used: 5, remaining: 15, resets_at: RESETS },
  instant_emails: { limit: 5, used: 1, remaining: 4 },
};
const PLUS: PlanSummary = {
  plan: "plus",
  billing_enabled: true,
  ai_uses: { limit: 150, used: 38, remaining: 112, resets_at: RESETS },
  instant_emails: { limit: 25, used: 3, remaining: 22 },
};

function setup(me: PlanSummary, billing = makeBilling({ plan: me.plan })) {
  const fetchMock = mockFetch({
    [`GET ${BILLING_URL}`]: jsonResponse(billing),
    [`GET ${ME_URL}`]: jsonResponse(makeMe({ ...me })),
    [`POST ${CHECKOUT_URL}`]: jsonResponse({ url: "https://stripe.test/pay" }),
  });
  return { fetchMock, ...renderWithProviders(<PlanChip me={me} />) };
}

beforeEach(() => {
  navigation.navigateTo.mockClear();
  window.history.replaceState(null, "", "/spaces");
});

describe("PlanChip", () => {
  it("renders nothing and asks for nothing when billing is off", () => {
    const fetchMock = mockFetch({});
    const { container } = renderWithProviders(
      <PlanChip me={{ ...FREE, billing_enabled: false }} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("labels a Free person Free", () => {
    setup(FREE);

    expect(screen.getByRole("button", { name: /Plan: Free/ })).toBeInTheDocument();
  });

  it("labels a Plus person Plus", () => {
    setup(PLUS);

    expect(screen.getByRole("button", { name: /Plan: Plus/ })).toBeInTheDocument();
  });

  it.each([
    ["Free", FREE],
    ["Plus", PLUS],
  ])("shrinks to an icon on narrow screens for %s", (name, me) => {
    setup(me);

    const chip = screen.getByRole("button", { name: new RegExp(`Plan: ${name}`) });

    expect(chip.querySelector("svg")).not.toBeNull();
    expect(within(chip).getByText(name)).toHaveClass("max-[480px]:sr-only");
  });

  it("opens with the usage meters, and the renewal line for Plus", async () => {
    const { user } = setup(
      PLUS,
      makeBilling({ plan: "plus", period_end: "2026-12-20T00:00:00Z", can_manage: true }),
    );

    await user.click(screen.getByRole("button", { name: /Plan: Plus/ }));

    expect(await screen.findByText("112 of 150 AI uses left")).toBeInTheDocument();
    expect(screen.getByText("3 of 25 instant emails used today")).toBeInTheDocument();
    expect(await screen.findByText("Renews on Dec 20, 2026")).toBeInTheDocument();
  });

  it("shows no renewal line on Free", async () => {
    const { user } = setup(FREE, makeBilling({ period_end: "2026-01-20T00:00:00Z" }));

    await user.click(screen.getByRole("button", { name: /Plan: Free/ }));

    await screen.findByRole("button", { name: "Buy 100 AI uses" });
    expect(screen.queryByText(/Renews on|Ends on/)).not.toBeInTheDocument();
  });

  it("offers the buy buttons from the billing data and returns to the current page", async () => {
    const { fetchMock, user } = setup(FREE);

    await user.click(screen.getByRole("button", { name: /Plan: Free/ }));
    await user.click(await screen.findByRole("button", { name: "Buy 100 AI uses" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/pay"),
    );
    expect(fetchMock.callsTo("POST", CHECKOUT_URL)[0]?.json).toEqual({
      product: "ai_pack",
      return_to: "/spaces?tab=shared",
    });
  });

  it("sends the person back to the current page after the portal", async () => {
    const fetchMock = mockFetch({
      [`GET ${BILLING_URL}`]: jsonResponse(makeBilling({ plan: "plus", can_manage: true })),
      [`GET ${ME_URL}`]: jsonResponse(makeMe({ ...PLUS })),
      "POST /api/billing/portal": jsonResponse({ url: "https://stripe.test/portal" }),
    });
    const { user } = renderWithProviders(<PlanChip me={PLUS} />);

    await user.click(screen.getByRole("button", { name: /Plan: Plus/ }));
    await user.click(await screen.findByRole("button", { name: "Manage subscription" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("https://stripe.test/portal"),
    );
    expect(fetchMock.callsTo("POST", "/api/billing/portal")[0]?.json).toEqual({
      return_to: "/spaces?tab=shared",
    });
  });

  it("shows an error and no buy buttons when billing cannot load, but still opens", async () => {
    mockFetch({
      [`GET ${BILLING_URL}`]: errorResponse(500, "error", "Billing is unavailable."),
      [`GET ${ME_URL}`]: jsonResponse(makeMe({ ...FREE })),
    });
    const { user } = renderWithProviders(<PlanChip me={FREE} />);

    await user.click(screen.getByRole("button", { name: /Plan: Free/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Billing is unavailable.");
    expect(screen.getByText("15 of 20 AI uses left")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy 100 AI uses" })).not.toBeInTheDocument();
  });

  it("asks for fresh numbers each time it opens", async () => {
    const { fetchMock, user } = setup(PLUS);
    await waitFor(() => expect(fetchMock.callsTo("GET", ME_URL).length).toBeGreaterThan(0));
    const before = fetchMock.callsTo("GET", ME_URL).length;
    expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Plan: Plus/ }));

    await waitFor(() => expect(fetchMock.callsTo("GET", BILLING_URL)).toHaveLength(1));
    await waitFor(() => expect(fetchMock.callsTo("GET", ME_URL).length).toBeGreaterThan(before));
  });

  it("links to billing in Settings", async () => {
    const { user } = setup(PLUS);

    await user.click(screen.getByRole("button", { name: /Plan: Plus/ }));

    expect(await screen.findByRole("link", { name: "Billing in Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

describe("AppHeader with the plan chip", () => {
  const person = { display_name: "Alex Smith", email: "alex@example.com" };

  it("shows the chip next to the avatar, which still goes straight to Settings", () => {
    mockFetch({ [`GET ${ME_URL}`]: jsonResponse(makeMe({ ...PLUS })) });

    renderWithProviders(<AppHeader me={{ ...person, ...PLUS }} current="spaces" />);

    expect(screen.getByRole("button", { name: /Plan: Plus/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows no chip when the page did not pass the plan", () => {
    mockFetch({});

    renderWithProviders(<AppHeader me={person} current="spaces" />);

    expect(screen.queryByRole("button", { name: /Plan:/ })).not.toBeInTheDocument();
  });

  it("shows no chip when billing is off", () => {
    mockFetch({});

    renderWithProviders(
      <AppHeader me={{ ...person, ...PLUS, billing_enabled: false }} current="spaces" />,
    );

    expect(screen.queryByRole("button", { name: /Plan:/ })).not.toBeInTheDocument();
  });
});
