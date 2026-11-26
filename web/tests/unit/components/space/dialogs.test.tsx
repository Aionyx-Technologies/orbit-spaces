import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteSpaceDialog } from "@/components/space/delete-space-dialog";
import { InviteDialog } from "@/components/space/invite-dialog";
import { RetractDialog } from "@/components/space/retract-dialog";
import type { RetractDialogProps } from "@/components/space/retract-dialog.types";
import { makeItem } from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";
import type { RenderedWithUser } from "@/tests/unit/helpers/render.types";

const INVITES_URL = "/api/spaces/space-1/invites";
const CREATED = {
  url: "https://orbit.example.com/invite/abc123",
  expires_at: "2026-11-26T09:00:00Z",
  emailed: false,
};

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);
vi.mock("@/lib/clipboard", () => clipboard);

function setupInvite() {
  return renderWithProviders(
    <InviteDialog spaceId="space-1">
      <button type="button">Invite</button>
    </InviteDialog>,
  );
}

async function openInvite(user: RenderedWithUser["user"]) {
  await user.click(screen.getByRole("button", { name: "Invite" }));
  return screen.getByRole("dialog", { name: "Invite someone" });
}

describe("InviteDialog", () => {
  it("opens from its trigger and explains what the link does", async () => {
    const { user } = setupInvite();

    const dialog = await openInvite(user);

    expect(dialog).toHaveAccessibleDescription(
      "Anyone with the link can join this space, once. It expires in 7 days.",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Their email (optional)" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create link" })).toBeEnabled();
  });

  it("says an emailed invitation waits for the person under Pending spaces", async () => {
    const { user } = setupInvite();

    const dialog = await openInvite(user);

    expect(
      within(dialog).getByRole("textbox", { name: "Their email (optional)" }),
    ).toHaveAccessibleDescription(/waits for them under Pending spaces/);
  });

  it("creates a link without an email and says it is shown only once", async () => {
    const mock = mockFetch({ [`POST ${INVITES_URL}`]: jsonResponse(CREATED, 201) });
    const { user } = setupInvite();
    await openInvite(user);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    const link = await screen.findByRole("textbox", { name: "Invite link" });
    expect(link).toHaveValue(CREATED.url);
    expect(link).toHaveAttribute("readonly");
    expect(mock.callsTo("POST", INVITES_URL)[0]?.json).toEqual({ email: null });
    expect(
      screen.getByText("Send this link to the person you want to invite. It is shown only once."),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Expires .*2026/)).toBeInTheDocument();
    expect(screen.queryByText(/We also emailed/)).not.toBeInTheDocument();
  });

  it("emails the link too when an address is given", async () => {
    const mock = mockFetch({
      [`POST ${INVITES_URL}`]: jsonResponse({ ...CREATED, emailed: true }, 201),
    });
    const { user } = setupInvite();
    await openInvite(user);

    await user.type(
      screen.getByRole("textbox", { name: "Their email (optional)" }),
      "blake@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(
      await screen.findByText("We also emailed this link to blake@example.com."),
    ).toBeInTheDocument();
    expect(mock.callsTo("POST", INVITES_URL)[0]?.json).toEqual({ email: "blake@example.com" });
    expect(screen.queryByText(/shown only once/)).not.toBeInTheDocument();
  });

  it("copies the link", async () => {
    clipboard.copyText.mockResolvedValue(true);
    mockFetch({ [`POST ${INVITES_URL}`]: jsonResponse(CREATED, 201) });
    const { user } = setupInvite();
    await openInvite(user);
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByRole("textbox", { name: "Invite link" });

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(CREATED.url);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("starts a fresh form for another link, without the earlier email", async () => {
    mockFetch({
      [`POST ${INVITES_URL}`]: jsonResponse({ ...CREATED, emailed: true }, 201),
    });
    const { user } = setupInvite();
    await openInvite(user);
    await user.type(
      screen.getByRole("textbox", { name: "Their email (optional)" }),
      "blake@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByRole("textbox", { name: "Invite link" });

    await user.click(screen.getByRole("button", { name: "Create another link" }));

    expect(screen.getByRole("textbox", { name: "Their email (optional)" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "Invite link" })).not.toBeInTheDocument();
  });

  it("closes with Done and reopens as a clean form", async () => {
    mockFetch({ [`POST ${INVITES_URL}`]: jsonResponse(CREATED, 201) });
    const { user } = setupInvite();
    await openInvite(user);
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByRole("textbox", { name: "Invite link" });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openInvite(user);

    expect(screen.queryByRole("textbox", { name: "Invite link" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Their email (optional)" })).toHaveValue("");
  });

  it("closes with Cancel and Escape", async () => {
    const { user } = setupInvite();
    await openInvite(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openInvite(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server's message and stays on the form", async () => {
    mockFetch({
      [`POST ${INVITES_URL}`]: errorResponse(
        429,
        "rate_limited",
        "You've sent a lot of invites. Try again later.",
      ),
    });
    const { user } = setupInvite();
    await openInvite(user);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've sent a lot of invites. Try again later.",
    );
    expect(screen.getByRole("button", { name: "Create link" })).toBeEnabled();
  });

  it("clears the error when the dialog is closed and reopened", async () => {
    mockFetch({
      [`POST ${INVITES_URL}`]: errorResponse(500, "server_error", "Something broke."),
    });
    const { user } = setupInvite();
    await openInvite(user);
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openInvite(user);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      [`POST ${INVITES_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setupInvite();
    await openInvite(user);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows progress and creates only one link while waiting", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ [`POST ${INVITES_URL}`]: () => gate.promise });
    const { user } = setupInvite();
    await openInvite(user);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    await user.keyboard("{Enter}");
    gate.resolve(jsonResponse(CREATED, 201));
    await screen.findByRole("textbox", { name: "Invite link" });
    expect(mock.callsTo("POST", INVITES_URL)).toHaveLength(1);
  });
});

function setupDelete() {
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <DeleteSpaceDialog spaceId="space-1" spaceName="Goa trip" open onOpenChange={onOpenChange} />,
  );
  return { onOpenChange, ...view };
}

describe("DeleteSpaceDialog", () => {
  it("names the space and says what is lost", () => {
    setupDelete();

    const dialog = screen.getByRole("alertdialog", { name: "Delete “Goa trip”?" });
    expect(dialog).toHaveAccessibleDescription(
      "This removes the space and everything shared in it, for everyone. It can't be undone.",
    );
  });

  it("deletes, confirms, closes and goes back to the list", async () => {
    const mock = mockFetch({ "DELETE /api/spaces/space-1": emptyResponse() });
    const { onOpenChange, user } = setupDelete();

    await user.click(screen.getByRole("button", { name: "Delete space" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces"));
    expect(mock.callsTo("DELETE", "/api/spaces/space-1")).toHaveLength(1);
    expect(toasts.success).toHaveBeenCalledWith("Space deleted");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does nothing until confirmed", async () => {
    const mock = mockFetch({});
    const { onOpenChange, user } = setupDelete();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mock.calls).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays put when deleting fails", async () => {
    mockFetch({
      "DELETE /api/spaces/space-1": errorResponse(
        403,
        "forbidden",
        "Only the person who created this space can delete it.",
      ),
    });
    const { onOpenChange, user } = setupDelete();

    await user.click(screen.getByRole("button", { name: "Delete space" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only the person who created this space can delete it.",
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete space" })).toBeEnabled();
  });

  it("forgets the error after Cancel", async () => {
    mockFetch({
      "DELETE /api/spaces/space-1": errorResponse(500, "server_error", "Something broke."),
    });
    const { user } = setupDelete();
    await user.click(screen.getByRole("button", { name: "Delete space" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      "DELETE /api/spaces/space-1": errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setupDelete();

    await user.click(screen.getByRole("button", { name: "Delete space" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cannot be dismissed while deleting", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch({ "DELETE /api/spaces/space-1": () => gate.promise });
    const { onOpenChange, user } = setupDelete();

    await user.click(screen.getByRole("button", { name: "Delete space" }));

    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    gate.resolve(emptyResponse());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces"));
  });
});

function setupRetract(overrides: Partial<RetractDialogProps> = {}) {
  const props: RetractDialogProps = {
    item: makeItem(),
    onClose: vi.fn(),
    onRetracted: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<RetractDialog {...props} />) };
}

describe("RetractDialog", () => {
  it("stays closed without an item", () => {
    setupRetract({ item: null });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("names the item and says who loses it", () => {
    setupRetract();

    const dialog = screen.getByRole("alertdialog", { name: "Retract “Morning flight”?" });
    expect(dialog).toHaveAccessibleDescription(
      "It disappears for everyone in this space. A plan that already used it keeps what it said.",
    );
  });

  it("retracts, reports the item, confirms and closes", async () => {
    const mock = mockFetch({ "DELETE /api/items/item-1": emptyResponse() });
    const { props, user } = setupRetract();

    await user.click(screen.getByRole("button", { name: "Retract" }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(mock.callsTo("DELETE", "/api/items/item-1")).toHaveLength(1);
    expect(props.onRetracted).toHaveBeenCalledWith(props.item);
    expect(toasts.success).toHaveBeenCalledWith("Retracted");
  });

  it("encodes the item id in the request", async () => {
    const mock = mockFetch({ "DELETE /api/items/a%2Fb": emptyResponse() });
    const { props, user } = setupRetract({ item: makeItem({ id: "a/b" }) });

    await user.click(screen.getByRole("button", { name: "Retract" }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(mock.callsTo("DELETE", "/api/items/a%2Fb")).toHaveLength(1);
  });

  it("closes on Cancel without retracting", async () => {
    const mock = mockFetch({});
    const { props, user } = setupRetract();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRetracted).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("shows the server's message and keeps the item when it fails", async () => {
    mockFetch({
      "DELETE /api/items/item-1": errorResponse(404, "not_found", "That item is already gone."),
    });
    const { props, user } = setupRetract();

    await user.click(screen.getByRole("button", { name: "Retract" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That item is already gone.");
    expect(props.onRetracted).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("forgets the error after Cancel", async () => {
    mockFetch({
      "DELETE /api/items/item-1": errorResponse(500, "server_error", "Something broke."),
    });
    const { user } = setupRetract();
    await user.click(screen.getByRole("button", { name: "Retract" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      "DELETE /api/items/item-1": errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { props, user } = setupRetract();

    await user.click(screen.getByRole("button", { name: "Retract" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("shows progress while retracting", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch({ "DELETE /api/items/item-1": () => gate.promise });
    const { props, user } = setupRetract();

    await user.click(screen.getByRole("button", { name: "Retract" }));

    expect(await screen.findByRole("button", { name: "Retracting…" })).toBeDisabled();
    gate.resolve(emptyResponse());
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });
});
