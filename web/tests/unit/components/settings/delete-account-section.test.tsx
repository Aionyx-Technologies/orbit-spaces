import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import { emptyResponse, errorResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderPlain } from "@/tests/unit/helpers/render";
import type { RenderedWithUser } from "@/tests/unit/helpers/render.types";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("@/lib/navigation", () => navigation);

async function openDeleteDialog(user: RenderedWithUser["user"]) {
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("alertdialog", { name: "Delete your account?" });
}

describe("DeleteAccountSection", () => {
  it("is a named region that says what deleting an account does", () => {
    renderPlain(<DeleteAccountSection />);

    const region = screen.getByRole("region", { name: "Delete account" });
    expect(region).toHaveTextContent("retracts what you shared");
    expect(within(region).getByRole("button", { name: "Delete account" })).toBeEnabled();
    expect(within(region).queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  describe("deleting the account", () => {
    it("asks for a typed confirmation and does nothing until it is given", async () => {
      const mock = mockFetch({});
      const { user } = renderPlain(<DeleteAccountSection />);

      const dialog = await openDeleteDialog(user);

      const confirm = within(dialog).getByRole("button", { name: "Delete account" });
      expect(confirm).toBeDisabled();
      const field = within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" });
      await user.type(field, "delet");
      expect(confirm).toBeDisabled();
      await user.type(field, "e");
      expect(confirm).toBeEnabled();
      expect(mock.calls).toHaveLength(0);
    });

    it("accepts the confirmation word in any case and with stray spaces", async () => {
      const { user } = renderPlain(<DeleteAccountSection />);
      const dialog = await openDeleteDialog(user);

      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "  DeLeTe ",
      );

      expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeEnabled();
    });

    it("deletes the account and goes to the home page", async () => {
      const mock = mockFetch({ "DELETE /api/me": emptyResponse() });
      const { user } = renderPlain(<DeleteAccountSection />);
      const dialog = await openDeleteDialog(user);
      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "delete",
      );

      await user.click(within(dialog).getByRole("button", { name: "Delete account" }));

      await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith("/"));
      expect(mock.callsTo("DELETE", "/api/me")).toHaveLength(1);
    });

    it("disables everything while deleting", async () => {
      const gate = Promise.withResolvers<Response>();
      mockFetch({ "DELETE /api/me": () => gate.promise });
      const { user } = renderPlain(<DeleteAccountSection />);
      const dialog = await openDeleteDialog(user);
      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "delete",
      );

      await user.click(within(dialog).getByRole("button", { name: "Delete account" }));

      expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      gate.resolve(emptyResponse());
      await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith("/"));
    });

    it("shows the server's message and keeps the dialog open when deleting fails", async () => {
      mockFetch({
        "DELETE /api/me": errorResponse(500, "server_error", "We couldn't delete your account."),
      });
      const { user } = renderPlain(<DeleteAccountSection />);
      const dialog = await openDeleteDialog(user);
      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "delete",
      );

      await user.click(within(dialog).getByRole("button", { name: "Delete account" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "We couldn't delete your account.",
      );
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete account" })).toBeEnabled();
      expect(navigation.navigateTo).not.toHaveBeenCalled();
    });

    it("sends a signed-out person to sign in", async () => {
      mockFetch({
        "DELETE /api/me": errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      const { user } = renderPlain(<DeleteAccountSection />);
      const dialog = await openDeleteDialog(user);
      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "delete",
      );

      await user.click(within(dialog).getByRole("button", { name: "Delete account" }));

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("forgets the typed word and any error when cancelled", async () => {
      mockFetch({
        "DELETE /api/me": errorResponse(500, "server_error", "We couldn't delete your account."),
      });
      const { user } = renderPlain(<DeleteAccountSection />);
      let dialog = await openDeleteDialog(user);
      await user.type(
        within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" }),
        "delete",
      );
      await user.click(within(dialog).getByRole("button", { name: "Delete account" }));
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      dialog = await openDeleteDialog(user);

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("textbox", { name: "Type “delete” to confirm" })).toHaveValue(
        "",
      );
      expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeDisabled();
    });

    it("closes with Escape", async () => {
      const { user } = renderPlain(<DeleteAccountSection />);
      await openDeleteDialog(user);

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
