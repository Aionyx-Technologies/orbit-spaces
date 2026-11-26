import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { makeBilling, makeMe } from "@/tests/unit/helpers/fixtures";
import { jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => {
  window.history.replaceState(null, "", "/settings?billing=success");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AppShell with the Billing card", () => {
  it("updates the Billing card when the header's refresh after Stripe finds the purchase", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let purchased = false;
    mockFetch({
      "GET /api/billing": () =>
        jsonResponse(purchased ? makeBilling({ plan: "plus", can_manage: true }) : makeBilling()),
      "GET /api/me": jsonResponse(makeMe({ billing_enabled: true })),
    });
    const me = makeMe({ billing_enabled: true });

    renderWithProviders(
      <AppShell me={me} current="settings">
        <SettingsScreen me={me} initialSpaces={{ spaces: [] }} />
      </AppShell>,
    );
    const card = await screen.findByRole("region", { name: "Billing" });
    await waitFor(() => expect(card).toHaveTextContent("Plan: Free"));

    purchased = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    await waitFor(() => expect(card).toHaveTextContent("Plan: Plus"));
  });
});
