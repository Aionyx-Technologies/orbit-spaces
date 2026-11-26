import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesSection } from "@/components/settings/preferences-section";
import { makeMe, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const browser = vi.hoisted(() => ({ zone: vi.fn((): string | null => "Asia/Kolkata") }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);
vi.mock("@/lib/time-zones", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  browserTimeZone: () => browser.zone(),
}));

const SPACES = [makeSpaceSummary(), makeSpaceSummary({ id: "space-2", name: "Work stuff" })];

function setup(me: { time_zone?: string; default_space_id?: string | null } = {}, spaces = SPACES) {
  return renderWithProviders(
    <PreferencesSection
      me={{ time_zone: "Europe/London", default_space_id: null, ...me }}
      initialSpaces={{ spaces }}
    />,
  );
}

const zoneField = () => screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
const spaceField = () =>
  screen.getByRole("combobox", { name: "Default space" }) as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save preferences" });

describe("PreferencesSection", () => {
  beforeEach(() => {
    browser.zone.mockReturnValue("Asia/Kolkata");
  });

  it("is a named region with a time zone and a default space", () => {
    setup();

    const region = screen.getByRole("region", { name: "Preferences" });
    expect(within(region).getAllByRole("combobox")).toHaveLength(2);
    expect(zoneField()).toHaveValue("Europe/London");
    expect(zoneField()).toHaveAccessibleDescription(
      /Used for the daily summary and for dates in emails\./,
    );
    expect(spaceField()).toHaveAccessibleDescription(
      "Used when you ask an assistant to share without naming a space.",
    );
  });

  it("lists the zones the browser knows, with UTC first", () => {
    setup();

    const options = within(zoneField()).getAllByRole("option");
    expect(options[0]).toHaveValue("UTC");
    expect(options.length).toBeGreaterThan(100);
    expect(within(zoneField()).getByRole("option", { name: "America/New York" })).toHaveValue(
      "America/New_York",
    );
  });

  it("offers Ask me each time first, then each space", () => {
    setup();

    const options = within(spaceField()).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Ask me each time",
      "Goa trip",
      "Work stuff",
    ]);
    expect(spaceField()).toHaveValue("");
  });

  it("shows the default space that was saved", () => {
    setup({ default_space_id: "space-2" });

    expect(spaceField()).toHaveValue("space-2");
    expect(saveButton()).toBeDisabled();
  });

  it("falls back to Ask me each time when the saved space is no longer in the list", () => {
    setup({ default_space_id: "space-gone" });

    expect(spaceField()).toHaveValue("");
    expect(saveButton()).toBeDisabled();
  });

  describe("filling in the time zone from the browser", () => {
    it("fills it in while the saved zone is still the UTC default, and says so", () => {
      setup({ time_zone: "UTC" });

      expect(zoneField()).toHaveValue("Asia/Kolkata");
      expect(zoneField()).toHaveAccessibleDescription(
        "Filled in from your browser. Save to keep it. Used for the daily summary and for dates in emails.",
      );
      expect(saveButton()).toBeEnabled();
    });

    it("never replaces a zone the person already chose", () => {
      setup({ time_zone: "Europe/London" });

      expect(zoneField()).toHaveValue("Europe/London");
      expect(zoneField()).not.toHaveAccessibleDescription(/Filled in/);
    });

    it.each([["UTC"], [null]])("fills in nothing when the browser says %s", (zone) => {
      browser.zone.mockReturnValue(zone);
      setup({ time_zone: "UTC" });

      expect(zoneField()).toHaveValue("UTC");
      expect(saveButton()).toBeDisabled();
    });

    it("keeps what the person picks over what the browser suggested", async () => {
      const { user } = setup({ time_zone: "UTC" });

      await user.selectOptions(zoneField(), "UTC");

      expect(zoneField()).toHaveValue("UTC");
      expect(saveButton()).toBeDisabled();
      expect(zoneField()).not.toHaveAccessibleDescription(/Filled in/);
    });

    it("saves the suggestion when the person presses Save", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ time_zone: "Asia/Kolkata" })),
      });
      const { user } = setup({ time_zone: "UTC" });

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Preferences saved"));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ time_zone: "Asia/Kolkata" });
      expect(zoneField()).toHaveValue("Asia/Kolkata");
      expect(saveButton()).toBeDisabled();
    });
  });

  describe("saving", () => {
    it("offers Save only once something has changed, and takes it away if it is changed back", async () => {
      const { user } = setup();
      expect(saveButton()).toBeDisabled();

      await user.selectOptions(spaceField(), "space-1");
      expect(saveButton()).toBeEnabled();

      await user.selectOptions(spaceField(), "");
      expect(saveButton()).toBeDisabled();
    });

    it("sends only the time zone when only that changed", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ time_zone: "America/New_York" })),
      });
      const { user } = setup();
      await user.selectOptions(zoneField(), "America/New_York");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ time_zone: "America/New_York" });
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("sends only the default space when only that changed", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(
          makeMe({ default_space_id: "space-2", time_zone: "Europe/London" }),
        ),
      });
      const { user } = setup();
      await user.selectOptions(spaceField(), "space-2");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ default_space_id: "space-2" });
      expect(spaceField()).toHaveValue("space-2");
      expect(saveButton()).toBeDisabled();
    });

    it("clears the default space with null when Ask me each time is chosen", async () => {
      const mock = mockFetch({ "PATCH /api/me": jsonResponse(makeMe({ default_space_id: null })) });
      const { user } = setup({ default_space_id: "space-2" });
      await user.selectOptions(spaceField(), "");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ default_space_id: null });
      expect(spaceField()).toHaveValue("");
    });

    it("sends both in one request when both changed", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(
          makeMe({ time_zone: "America/New_York", default_space_id: "space-1" }),
        ),
      });
      const { user } = setup();
      await user.selectOptions(zoneField(), "America/New_York");
      await user.selectOptions(spaceField(), "space-1");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")).toHaveLength(1);
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({
        time_zone: "America/New_York",
        default_space_id: "space-1",
      });
    });

    it("shows the server's message and keeps the choices when saving fails", async () => {
      mockFetch({
        "PATCH /api/me": errorResponse(403, "not_a_member", "You are not a member of that space."),
      });
      const { user } = setup();
      await user.selectOptions(spaceField(), "space-2");

      await user.click(saveButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You are not a member of that space.",
      );
      expect(spaceField()).toHaveValue("space-2");
      expect(saveButton()).toBeEnabled();
      expect(toasts.success).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("shows the message for a time zone Orbit does not know", async () => {
      mockFetch({
        "PATCH /api/me": errorResponse(422, "invalid", "That time zone is not one Orbit knows."),
      });
      const { user } = setup();
      await user.selectOptions(zoneField(), "America/New_York");

      await user.click(saveButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That time zone is not one Orbit knows.",
      );
    });

    it("sends a signed-out person to sign in without an error message", async () => {
      mockFetch({
        "PATCH /api/me": errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      const { user } = setup();
      await user.selectOptions(spaceField(), "space-2");

      await user.click(saveButton());

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows progress and saves only once while waiting", async () => {
      const gate = Promise.withResolvers<Response>();
      const mock = mockFetch({ "PATCH /api/me": () => gate.promise });
      const { user } = setup();
      await user.selectOptions(spaceField(), "space-2");

      await user.click(saveButton());

      expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
      await user.keyboard("{Enter}");
      gate.resolve(jsonResponse(makeMe({ default_space_id: "space-2" })));
      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")).toHaveLength(1);
    });
  });
});
