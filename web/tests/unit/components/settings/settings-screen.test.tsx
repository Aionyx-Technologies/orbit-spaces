import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { makeBilling, makeMe, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup() {
  return renderWithProviders(
    <SettingsScreen me={makeMe()} initialSpaces={{ spaces: [makeSpaceSummary()] }} />,
  );
}

describe("SettingsScreen", () => {
  it("links to the privacy, terms and data policy pages", () => {
    setup();

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Data policy" })).toHaveAttribute(
      "href",
      "/data-policy",
    );
  });

  it("has the page heading and a way back to the spaces", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spaces" })).toHaveAttribute("href", "/spaces");
  });

  it("shows the six cards in the order people need them, and no others", () => {
    setup();

    expect(
      screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby")),
    ).toEqual([
      "profile-title",
      "notifications-title",
      "preferences-title",
      "security-title",
      "your-data-title",
      "delete-account-title",
    ]);

    const names = [
      "Profile",
      "Email notifications",
      "Preferences",
      "Security",
      "Your data",
      "Delete account",
    ];
    const regions = names.map((name) => screen.getByRole("region", { name }));
    regions.slice(1).forEach((region, index) => {
      const previous = regions[index] as HTMLElement;
      expect(
        previous.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("puts Billing directly under Profile when billing is on", async () => {
    mockFetch({
      "GET /api/billing": jsonResponse(makeBilling()),
      "GET /api/me": jsonResponse(makeMe({ billing_enabled: true })),
    });
    renderWithProviders(
      <SettingsScreen
        me={makeMe({ billing_enabled: true })}
        initialSpaces={{ spaces: [makeSpaceSummary()] }}
      />,
    );

    await screen.findByRole("region", { name: "Billing" });
    expect(
      screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby")),
    ).toEqual([
      "profile-title",
      "billing-title",
      "notifications-title",
      "preferences-title",
      "security-title",
      "your-data-title",
      "delete-account-title",
    ]);
  });

  it("passes each section the data the server rendered", () => {
    setup();

    expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Alex");
  });

  it("gives each card the right part of the person's details", () => {
    renderWithProviders(
      <SettingsScreen
        me={makeMe({
          about: "Plans the trips",
          email_frequency: "daily",
          time_zone: "Europe/London",
          default_space_id: "space-1",
          last_sign_in: { at: "2026-11-19T10:30:00Z", browser: "Chrome" },
        })}
        initialSpaces={{ spaces: [makeSpaceSummary()] }}
      />,
    );

    expect(screen.getByRole("textbox", { name: "About me" })).toHaveValue("Plans the trips");
    expect(screen.getByRole("radio", { name: /Daily summary/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("Europe/London");
    expect(screen.getByRole("combobox", { name: "Default space" })).toHaveValue("space-1");
    expect(screen.getByText("Last sign-in: 19 Nov 2026, Chrome")).toBeInTheDocument();
  });

  it("hides the per-space email switches when the person turned emails off", () => {
    renderWithProviders(
      <SettingsScreen
        me={makeMe({ email_frequency: "off" })}
        initialSpaces={{ spaces: [makeSpaceSummary()] }}
      />,
    );

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("SettingsScreen without the assistant setup", () => {
  it("leaves connecting assistants to the Assistants tab", () => {
    setup();

    expect(screen.queryByRole("region", { name: "Connect an assistant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Connected assistants" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Orbit connector address" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it("keeps sign out in Security and the account deletion last and apart", () => {
    setup();

    const security = screen.getByRole("region", { name: "Security" });
    const deletion = screen.getByRole("region", { name: "Delete account" });
    expect(security).toContainElement(screen.getByRole("button", { name: "Sign out" }));
    expect(deletion).not.toContainElement(screen.getByRole("button", { name: "Sign out" }));
    expect(deletion).toHaveClass("border-destructive/40");
    expect(screen.getAllByRole("region").at(-1)).toBe(deletion);
  });
});
