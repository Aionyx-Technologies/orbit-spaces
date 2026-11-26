import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanCard } from "@/components/space/plan-card";
import type { PlanCardProps } from "@/components/space/plan-card.types";
import { ALEX_ID, makePlan } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const COMBINE_URL = "/api/spaces/space-1/combine";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/download", () => download);

function setup(overrides: Partial<PlanCardProps> = {}) {
  const props: PlanCardProps = {
    spaceId: "space-1",
    plan: null,
    meId: ALEX_ID,
    combineEnabled: true,
    onCombined: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<PlanCard {...props} />) };
}

describe("PlanCard", () => {
  it("renders nothing when there is no plan and combining is not available", () => {
    const { container } = setup({ plan: null, combineEnabled: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("invites the first combine when there is no plan yet", () => {
    setup();

    const region = screen.getByRole("region", { name: "Latest plan" });
    expect(within(region).getByText(/No plan yet/)).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Combine" })).toBeEnabled();
  });

  it("shows the plan, who wrote it and a clear Written by Orbit label", () => {
    setup({ plan: makePlan() });

    const region = screen.getByRole("region", { name: "Latest plan" });
    expect(within(region).getByText("Written by Orbit")).toBeInTheDocument();
    expect(within(region).getByText("Stay at Hotel 2.")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "To settle" })).toBeInTheDocument();
    expect(within(region).getByText("Orbit")).toBeInTheDocument();
    expect(within(region).getByText(/requested via ChatGPT/)).toBeInTheDocument();
    expect(within(region).queryByText(/No plan yet/)).not.toBeInTheDocument();
  });

  it("shows the template sections as headings", () => {
    setup({
      plan: makePlan({
        content: "Where to stay\nSeaside Inn\n\nCosts\n- Flights\n\nTo settle\n- Dates",
      }),
      sections: ["Where to stay", "Costs", "To settle"],
    });

    const region = screen.getByRole("region", { name: "Latest plan" });
    expect(
      within(region)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Where to stay", "Costs", "To settle"]);
  });

  it("offers Share for the latest plan, even to people who cannot combine", async () => {
    download.downloadTextFile.mockReset();
    const { user } = setup({ plan: makePlan(), combineEnabled: false });

    await user.click(screen.getByRole("button", { name: "Share Combined plan" }));
    await user.click(await screen.findByRole("menuitem", { name: "Download as Markdown" }));

    expect(download.downloadTextFile).toHaveBeenCalledWith(
      "combined-plan.md",
      "# Combined plan\n\nStay at Hotel 2.\n\nTo settle\n- Check-in time\n",
    );
  });

  it("offers no Share before there is a plan", () => {
    setup({ plan: null });

    expect(screen.queryByRole("button", { name: /^Share/ })).not.toBeInTheDocument();
  });

  it("keeps showing the plan to people who cannot combine", () => {
    setup({ plan: makePlan(), combineEnabled: false });

    expect(screen.getByRole("region", { name: "Latest plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Combine" })).not.toBeInTheDocument();
  });

  it("never renders a plan as HTML", () => {
    const { container } = setup({
      plan: makePlan({ content: "<img src=x onerror=alert(1)>\n\n- <b>bold</b>" }),
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("combines, hands the result on and confirms", async () => {
    const result = { item: makePlan({ id: "plan-2" }), created: true };
    const mock = mockFetch({ [`POST ${COMBINE_URL}`]: jsonResponse(result) });
    const { props, user } = setup();

    await user.click(screen.getByRole("button", { name: "Combine" }));

    await waitFor(() => expect(props.onCombined).toHaveBeenCalledWith(result));
    expect(mock.callsTo("POST", COMBINE_URL)[0]?.json).toEqual({ instruction: null });
    expect(toasts.success).toHaveBeenCalledWith("Combined into a new plan");
  });

  it("says so when there was nothing new to combine", async () => {
    mockFetch({
      [`POST ${COMBINE_URL}`]: jsonResponse({ item: makePlan(), created: false }),
    });
    const { props, user } = setup({ plan: makePlan() });

    await user.click(screen.getByRole("button", { name: "Combine" }));

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith("Nothing new since the last plan"),
    );
    expect(props.onCombined).toHaveBeenCalledTimes(1);
  });

  it("shows progress and marks the card busy while combining", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch({ [`POST ${COMBINE_URL}`]: () => gate.promise });
    const { props, user } = setup();

    await user.click(screen.getByRole("button", { name: "Combine" }));

    expect(await screen.findByRole("button", { name: "Combining…" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Latest plan" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    gate.resolve(jsonResponse({ item: makePlan(), created: true }));
    await waitFor(() => expect(props.onCombined).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Latest plan" })).toHaveAttribute(
        "aria-busy",
        "false",
      ),
    );
    expect(screen.getByRole("button", { name: "Combine" })).toBeEnabled();
  });

  it("shows the server's message and lets people try again", async () => {
    mockFetch({
      [`POST ${COMBINE_URL}`]: errorResponse(
        429,
        "rate_limited",
        "Combining is limited to a few times an hour. Try again later.",
      ),
    });
    const { props, user } = setup();

    await user.click(screen.getByRole("button", { name: "Combine" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Combining is limited to a few times an hour. Try again later.",
    );
    expect(screen.getByRole("button", { name: "Combine" })).toBeEnabled();
    expect(props.onCombined).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("clears the error once a retry works", async () => {
    let attempts = 0;
    mockFetch({
      [`POST ${COMBINE_URL}`]: () =>
        attempts++ === 0
          ? errorResponse(502, "upstream_error", "The assistant is busy. Try again.")
          : jsonResponse({ item: makePlan(), created: true }),
    });
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: "Combine" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Combine" }));

    await waitFor(() => expect(props.onCombined).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      [`POST ${COMBINE_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Combine" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows how many AI uses are left beside the Combine button", () => {
    setup({ aiUses: { limit: 20, used: 5, remaining: 15, resets_at: "2026-12-03T09:00:00Z" } });

    expect(screen.getByText("15 of 20 AI uses left this month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Combine" })).toBeEnabled();
  });

  it("turns Combine off and says when it comes back once the uses are gone", () => {
    setup({ aiUses: { limit: 20, used: 20, remaining: 0, resets_at: "2026-12-03T09:00:00Z" } });

    expect(screen.getByText(/No AI uses left this month/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Combine" })).toBeDisabled();
  });

  it("points to Settings once the uses are gone when billing is on", () => {
    setup({
      aiUses: { limit: 20, used: 20, remaining: 0, resets_at: "2026-12-03T09:00:00Z" },
      billingEnabled: true,
    });

    expect(screen.getByText(/Buy more or upgrade in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
  });

  it("asks for fresh counts after a combine, whether it worked or not", async () => {
    mockFetch({
      [`POST ${COMBINE_URL}`]: errorResponse(402, "ai_uses_exhausted", "You have used all 20."),
    });
    const { props, user } = setup({ onUsesChanged: vi.fn() });

    await user.click(screen.getByRole("button", { name: "Combine" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You have used all 20.");
    expect(props.onUsesChanged).toHaveBeenCalledTimes(1);
  });
});
