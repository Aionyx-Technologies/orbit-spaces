import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpaceEmailSwitch } from "@/components/space/space-email-switch";
import type { SpaceEmailSwitchProps } from "@/components/space/space-email-switch.types";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderPlain } from "@/tests/unit/helpers/render";

const MEMBERSHIP_URL = "/api/spaces/space-1/membership";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function setup(overrides: Partial<SpaceEmailSwitchProps> = {}) {
  const props: SpaceEmailSwitchProps = {
    spaceId: "space-1",
    notifyEmail: true,
    frequency: "instant",
    onChanged: vi.fn(),
    ...overrides,
  };
  return { props, ...renderPlain(<SpaceEmailSwitch {...props} />) };
}

const theSwitch = () => screen.getByRole("switch", { name: "Email me about this space" });

describe("SpaceEmailSwitch", () => {
  it.each([
    ["instant", true],
    ["daily", false],
  ] as const)("is shown with %s emails, reflecting the setting", (frequency, notifyEmail) => {
    setup({ frequency, notifyEmail });

    expect(theSwitch().getAttribute("aria-checked")).toBe(String(notifyEmail));
  });

  it("is replaced by a link to Settings when emails are off", () => {
    setup({ frequency: "off" });

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText(/Activity emails are off for your account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change that in Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("tells the page at once, then confirms once the server agrees", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ [`PATCH ${MEMBERSHIP_URL}`]: () => gate.promise });
    const { user, props } = setup();

    await user.click(theSwitch());

    expect(props.onChanged).toHaveBeenCalledWith(false);
    expect(toasts.success).not.toHaveBeenCalled();
    gate.resolve(jsonResponse({ notify_email: false }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications off"));
    expect(mock.callsTo("PATCH", MEMBERSHIP_URL)[0]?.json).toEqual({ notify_email: false });
  });

  it("turns notifications on and says so", async () => {
    mockFetch({ [`PATCH ${MEMBERSHIP_URL}`]: jsonResponse({ notify_email: true }) });
    const { user, props } = setup({ notifyEmail: false });

    await user.click(theSwitch());

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications on"));
    expect(props.onChanged).toHaveBeenCalledWith(true);
  });

  it("puts the page back and shows the server's message when saving fails", async () => {
    mockFetch({
      [`PATCH ${MEMBERSHIP_URL}`]: errorResponse(
        500,
        "server_error",
        "We couldn't save that. Please try again.",
      ),
    });
    const { user, props } = setup();

    await user.click(theSwitch());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save that. Please try again.",
    );
    expect(props.onChanged).toHaveBeenNthCalledWith(1, false);
    expect(props.onChanged).toHaveBeenNthCalledWith(2, true);
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
    await user.click(theSwitch());
    await screen.findByRole("alert");

    await user.click(theSwitch());

    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in without an error message", async () => {
    mockFetch({
      [`PATCH ${MEMBERSHIP_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setup();

    await user.click(theSwitch());

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("works from the keyboard", async () => {
    const mock = mockFetch({ [`PATCH ${MEMBERSHIP_URL}`]: jsonResponse({ notify_email: false }) });
    const { user } = setup();

    theSwitch().focus();
    await user.keyboard(" ");

    await waitFor(() => expect(mock.callsTo("PATCH", MEMBERSHIP_URL)).toHaveLength(1));
  });
});
