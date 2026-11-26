import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationsSection } from "@/components/settings/notifications-section";
import type { EmailFrequency } from "@/lib/api.types";
import { makeMe, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const MEMBERSHIP_URL = "/api/spaces/space-1/membership";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

const TWO_SPACES = [
  makeSpaceSummary(),
  makeSpaceSummary({ id: "space-2", name: "Work stuff", notify_email: false }),
];

function setup(
  spaces = TWO_SPACES,
  options: { frequency?: EmailFrequency; timeZone?: string } = {},
) {
  const { frequency = "instant", timeZone = "UTC" } = options;
  return renderWithProviders(
    <NotificationsSection initial={{ spaces }} frequency={frequency} timeZone={timeZone} />,
  );
}

describe("NotificationsSection", () => {
  it("shows one labelled switch per space, reflecting the current choice", () => {
    setup();

    const region = screen.getByRole("region", { name: "Email notifications" });
    expect(within(region).getAllByRole("switch")).toHaveLength(2);
    expect(within(region).getByRole("switch", { name: "Goa trip" })).toBeChecked();
    expect(within(region).getByRole("switch", { name: "Work stuff" })).not.toBeChecked();
  });

  it("cuts a very long space name short instead of pushing the page wider", () => {
    const name = "Quarterly planning with the whole extended leadership team and all partners";
    setup([makeSpaceSummary({ name })]);

    const label = screen.getByText(name);
    expect(label).toHaveClass("block", "truncate");
    expect(label.parentElement).toHaveClass("min-w-0");
  });

  it("says when there is nothing to switch yet", () => {
    setup([]);

    expect(screen.getByText("Switches appear here once you are in a space.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("turns notifications off at once and confirms once the server agrees", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ [`PATCH ${MEMBERSHIP_URL}`]: () => gate.promise });
    const { user } = setup();

    await user.click(screen.getByRole("switch", { name: "Goa trip" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Goa trip" })).not.toBeChecked());
    expect(toasts.success).not.toHaveBeenCalled();
    gate.resolve(jsonResponse({ notify_email: false }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications off"));
    expect(mock.callsTo("PATCH", MEMBERSHIP_URL)[0]?.json).toEqual({ notify_email: false });
    expect(screen.getByRole("switch", { name: "Goa trip" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Work stuff" })).not.toBeChecked();
  });

  it("turns notifications on and says so", async () => {
    const mock = mockFetch({
      "PATCH /api/spaces/space-2/membership": jsonResponse({ notify_email: true }),
    });
    const { user } = setup();

    await user.click(screen.getByRole("switch", { name: "Work stuff" }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications on"));
    expect(mock.callsTo("PATCH", "/api/spaces/space-2/membership")[0]?.json).toEqual({
      notify_email: true,
    });
    expect(screen.getByRole("switch", { name: "Work stuff" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked();
  });

  it("puts the switch back and shows the server's message when saving fails", async () => {
    mockFetch({
      [`PATCH ${MEMBERSHIP_URL}`]: errorResponse(
        500,
        "server_error",
        "We couldn't save that. Please try again.",
      ),
    });
    const { user } = setup();

    await user.click(screen.getByRole("switch", { name: "Goa trip" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save that. Please try again.",
    );
    await waitFor(() => expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked());
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("clears the error on the next attempt", async () => {
    let attempts = 0;
    mockFetch({
      [`PATCH ${MEMBERSHIP_URL}`]: () =>
        attempts++ === 0
          ? errorResponse(500, "server_error", "We couldn't save that.")
          : jsonResponse({ notify_email: false }),
    });
    const { user } = setup();
    await user.click(screen.getByRole("switch", { name: "Goa trip" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("switch", { name: "Goa trip" }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in without an error message", async () => {
    mockFetch({
      [`PATCH ${MEMBERSHIP_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setup();

    await user.click(screen.getByRole("switch", { name: "Goa trip" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("works from the keyboard", async () => {
    const mock = mockFetch({ [`PATCH ${MEMBERSHIP_URL}`]: jsonResponse({ notify_email: false }) });
    const { user } = setup();

    screen.getByRole("switch", { name: "Goa trip" }).focus();
    await user.keyboard(" ");

    await waitFor(() => expect(mock.callsTo("PATCH", MEMBERSHIP_URL)).toHaveLength(1));
  });
});

describe("NotificationsSection frequency", () => {
  it("offers three ways to be emailed and shows the current one chosen", () => {
    setup(TWO_SPACES, { frequency: "daily" });

    const group = screen.getByRole("radiogroup", { name: "How often to email you" });
    const choices = within(group).getAllByRole("radio");
    expect(choices.map((choice) => choice.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(within(group).getByRole("radio", { name: /As it happens/ })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /Daily summary/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /^Off/ })).not.toBeChecked();
  });

  it("explains each choice in plain words", () => {
    setup(TWO_SPACES, { timeZone: "Asia/Kolkata" });

    expect(
      screen.getByText(
        "An email soon after something changes, at most one every 5 minutes per space.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "One email a day, at 8:00 in your time zone (Asia/Kolkata), covering every space with changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("No emails about activity in your spaces.")).toBeInTheDocument();
  });

  it("says that sign-in links and invitations are always sent", () => {
    setup();

    expect(screen.getByText("Sign-in links and invitations are always sent.")).toBeInTheDocument();
  });

  it("saves a new choice at once and confirms", async () => {
    const mock = mockFetch({ "PATCH /api/me": jsonResponse(makeMe({ email_frequency: "daily" })) });
    const { user } = setup();

    await user.click(screen.getByRole("radio", { name: /Daily summary/ }));

    expect(screen.getByRole("radio", { name: /Daily summary/ })).toBeChecked();
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith("Emails set to a daily summary"),
    );
    expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ email_frequency: "daily" });
  });

  it.each([
    ["As it happens", "instant", "Emails set to as it happens", "daily"],
    ["Off", "off", "Activity emails turned off", "instant"],
  ] as const)("says what %s did", async (label, value, message, start) => {
    mockFetch({ "PATCH /api/me": jsonResponse(makeMe({ email_frequency: value })) });
    const { user } = setup(TWO_SPACES, { frequency: start });

    await user.click(screen.getByRole("radio", { name: new RegExp(`^${label}`) }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith(message));
  });

  it("works from the keyboard", async () => {
    const mock = mockFetch({ "PATCH /api/me": jsonResponse(makeMe({ email_frequency: "daily" })) });
    const { user } = setup();

    screen.getByRole("radio", { name: /Daily summary/ }).focus();
    await user.keyboard(" ");

    await waitFor(() => expect(mock.callsTo("PATCH", "/api/me")).toHaveLength(1));
    expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ email_frequency: "daily" });
  });

  it("puts the old choice back and shows the server's message when saving fails", async () => {
    mockFetch({
      "PATCH /api/me": errorResponse(
        422,
        "invalid",
        "Choose as it happens, a daily summary, or off.",
      ),
    });
    const { user } = setup();

    await user.click(screen.getByRole("radio", { name: /Daily summary/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose as it happens, a daily summary, or off.",
    );
    expect(screen.getByRole("radio", { name: /As it happens/ })).toBeChecked();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in without an error message", async () => {
    mockFetch({ "PATCH /api/me": errorResponse(401, "unauthenticated", "Sign in to continue.") });
    const { user } = setup();

    await user.click(screen.getByRole("radio", { name: /Daily summary/ }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("NotificationsSection per-space switches and Off", () => {
  it("hides the switches when emails are off", () => {
    setup(TWO_SPACES, { frequency: "off" });

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Switches appear here once you are in a space."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sign-in links and invitations are always sent.")).toBeInTheDocument();
  });

  it("hides the switches the moment Off is chosen and brings them back with the other choices", async () => {
    mockFetch({ "PATCH /api/me": jsonResponse(makeMe()) });
    const { user } = setup();
    expect(screen.getAllByRole("switch")).toHaveLength(2);

    await user.click(screen.getByRole("radio", { name: /^Off/ }));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Daily summary/ }));
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("shows the switches again if turning emails off could not be saved", async () => {
    mockFetch({ "PATCH /api/me": errorResponse(500, "server_error", "We couldn't save that.") });
    const { user } = setup();

    await user.click(screen.getByRole("radio", { name: /^Off/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't save that.");
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("keeps the switches with a daily summary, because they decide which spaces are included", () => {
    setup(TWO_SPACES, { frequency: "daily" });

    expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Work stuff" })).not.toBeChecked();
  });
});
