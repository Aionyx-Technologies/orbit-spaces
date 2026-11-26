import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SecuritySection } from "@/components/settings/security-section";
import {
  emptyResponse,
  errorResponse,
  failFetch,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { renderPlain } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("@/lib/navigation", () => navigation);

const REVOKE_URL = "/api/me/sessions/revoke-all";

function setup(me: Partial<Parameters<typeof SecuritySection>[0]["me"]> = {}) {
  return renderPlain(<SecuritySection me={{ last_sign_in: null, time_zone: "UTC", ...me }} />);
}

describe("SecuritySection", () => {
  it("is a named region with both ways to sign out and no delete button", () => {
    setup();

    const region = screen.getByRole("region", { name: "Security" });
    expect(within(region).getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(within(region).getByRole("button", { name: "Sign out everywhere" })).toBeEnabled();
    expect(
      within(region).queryByRole("button", { name: "Delete account" }),
    ).not.toBeInTheDocument();
  });

  it("says that connected assistants are not affected and links to the Assistants tab", () => {
    setup();

    const region = screen.getByRole("region", { name: "Security" });
    expect(region).toHaveTextContent("Connected assistants are not affected.");
    expect(within(region).getByRole("link", { name: "Assistants tab" })).toHaveAttribute(
      "href",
      "/assistants",
    );
  });

  describe("the last sign-in line", () => {
    it("gives the date and the browser, in the person's own time zone", () => {
      setup({
        last_sign_in: { at: "2026-11-19T22:30:00Z", browser: "Chrome" },
        time_zone: "Asia/Kolkata",
      });

      expect(screen.getByText("Last sign-in: 20 Nov 2026, Chrome")).toBeInTheDocument();
    });

    it("shows no line when there is no earlier sign-in to report", () => {
      setup({ last_sign_in: null });

      expect(screen.queryByText(/Last sign-in/)).not.toBeInTheDocument();
    });

    it("shows no line when the date cannot be read", () => {
      setup({ last_sign_in: { at: "later", browser: "Chrome" } });

      expect(screen.queryByText(/Last sign-in/)).not.toBeInTheDocument();
    });

    it("shows only a date and a browser name, nothing that could identify a device", () => {
      setup({ last_sign_in: { at: "2026-11-19T10:30:00Z", browser: "Firefox" } });

      const line = screen.getByText(/Last sign-in/);
      expect(line.textContent).toBe("Last sign-in: 19 Nov 2026, Firefox");
    });
  });

  describe("signing out of this browser", () => {
    it("signs out and goes to the home page", async () => {
      const mock = mockFetch({ "POST /auth/sign-out": jsonResponse({ status: "signed_out" }) });
      const { user } = setup();

      await user.click(screen.getByRole("button", { name: "Sign out" }));

      await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith("/"));
      expect(mock.callsTo("POST", "/auth/sign-out")).toHaveLength(1);
    });

    it("shows progress while signing out", async () => {
      const gate = Promise.withResolvers<Response>();
      mockFetch({ "POST /auth/sign-out": () => gate.promise });
      const { user } = setup();

      await user.click(screen.getByRole("button", { name: "Sign out" }));

      expect(await screen.findByRole("button", { name: "Signing out…" })).toBeDisabled();
      gate.resolve(jsonResponse({ status: "signed_out" }));
      await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith("/"));
    });

    it("shows the server's message and lets the person try again when it fails", async () => {
      mockFetch({
        "POST /auth/sign-out": errorResponse(500, "server_error", "Could not sign you out."),
      });
      const { user } = setup();

      await user.click(screen.getByRole("button", { name: "Sign out" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign you out.");
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(navigation.navigateTo).not.toHaveBeenCalled();
    });
  });

  describe("signing out everywhere", () => {
    async function openConfirmation() {
      const view = setup();
      await view.user.click(screen.getByRole("button", { name: "Sign out everywhere" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Sign out everywhere?" });
      return { ...view, dialog };
    }

    it("asks first, and says what it does and does not do", async () => {
      const mock = mockFetch({});
      const { dialog } = await openConfirmation();

      expect(dialog).toHaveTextContent("every browser and device, including this one");
      expect(dialog).toHaveTextContent("Assistants you have connected stay connected.");
      expect(mock.calls).toHaveLength(0);
    });

    it("does nothing when the person changes their mind", async () => {
      const mock = mockFetch({});
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(mock.calls).toHaveLength(0);
      expect(navigation.navigateTo).not.toHaveBeenCalled();
    });

    it("ends every session and sends the person to the sign-in page", async () => {
      const mock = mockFetch({ [`POST ${REVOKE_URL}`]: emptyResponse() });
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(mock.callsTo("POST", REVOKE_URL)).toHaveLength(1);
      expect(mock.callsTo("POST", "/auth/sign-out")).toHaveLength(0);
    });

    it("shows progress, cannot be dismissed while working and asks only once", async () => {
      const gate = Promise.withResolvers<Response>();
      const mock = mockFetch({ [`POST ${REVOKE_URL}`]: () => gate.promise });
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

      expect(await within(dialog).findByRole("button", { name: "Signing out…" })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      gate.resolve(emptyResponse());
      await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("POST", REVOKE_URL)).toHaveLength(1);
    });

    it("shows the server's message in the dialog and lets the person try again", async () => {
      mockFetch({
        [`POST ${REVOKE_URL}`]: errorResponse(500, "server_error", "We couldn't sign you out."),
      });
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "We couldn't sign you out.",
      );
      expect(within(dialog).getByRole("button", { name: "Sign out everywhere" })).toBeEnabled();
      expect(navigation.navigateTo).not.toHaveBeenCalled();
    });

    it("clears an old error when the dialog is opened again", async () => {
      mockFetch({
        [`POST ${REVOKE_URL}`]: errorResponse(500, "server_error", "We couldn't sign you out."),
      });
      const { user, dialog } = await openConfirmation();
      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));
      await within(dialog).findByRole("alert");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));

      const again = await screen.findByRole("alertdialog", { name: "Sign out everywhere?" });
      expect(within(again).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("says when Orbit cannot be reached", async () => {
      failFetch();
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("can't be reached");
    });

    it("goes to sign in without an error when the session has already ended", async () => {
      mockFetch({
        [`POST ${REVOKE_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      const { user, dialog } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
