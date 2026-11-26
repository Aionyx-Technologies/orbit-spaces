import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InviteAccept } from "@/components/invite/invite-accept";
import type { InviteAcceptProps } from "@/components/invite/invite-accept.types";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderPlain } from "@/tests/unit/helpers/render";

const ACCEPT_URL = "/api/invites/abc123/accept";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/invite/abc123"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function setup(overrides: Partial<InviteAcceptProps> = {}) {
  const props: InviteAcceptProps = {
    token: "abc123",
    spaceName: "Goa trip",
    alreadyMember: false,
    ...overrides,
  };
  return { props, ...renderPlain(<InviteAccept {...props} />) };
}

describe("InviteAccept", () => {
  it("explains what accepting does and offers one clear action", () => {
    setup();

    expect(
      screen.getByText("Accept to see what has been shared and add your own."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeEnabled();
  });

  it("offers to open the space instead when the person is already in it", () => {
    setup({ alreadyMember: true });

    expect(screen.getByRole("button", { name: "Open space" })).toBeEnabled();
    expect(screen.getByText("Open it to see what has been shared.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invite" })).not.toBeInTheDocument();
  });

  it("accepts, welcomes the person and opens the space", async () => {
    const mock = mockFetch({
      [`POST ${ACCEPT_URL}`]: jsonResponse({ space_id: "space-1", already_member: false }),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/space-1"));
    expect(mock.callsTo("POST", ACCEPT_URL)).toHaveLength(1);
    expect(toasts.success).toHaveBeenCalledWith("You joined Goa trip");
  });

  it("opens the space without a welcome when the server says they were already in it", async () => {
    mockFetch({
      [`POST ${ACCEPT_URL}`]: jsonResponse({ space_id: "space-1", already_member: true }),
    });
    const { user } = setup({ alreadyMember: true });

    await user.click(screen.getByRole("button", { name: "Open space" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/space-1"));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("encodes an unusual token in the request", async () => {
    const mock = mockFetch({
      "POST /api/invites/a%2Fb/accept": jsonResponse({
        space_id: "space-1",
        already_member: false,
      }),
    });
    const { user } = setup({ token: "a/b" });

    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(mock.callsTo("POST", "/api/invites/a%2Fb/accept")).toHaveLength(1);
  });

  it("stays disabled while working and after success, as the page is changing", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ [`POST ${ACCEPT_URL}`]: () => gate.promise });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    expect(await screen.findByRole("button", { name: "One moment…" })).toBeDisabled();
    gate.resolve(jsonResponse({ space_id: "space-1", already_member: false }));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "One moment…" })).toBeDisabled();
    expect(mock.callsTo("POST", ACCEPT_URL)).toHaveLength(1);
  });

  it("shows the server's message and lets the person try again", async () => {
    mockFetch({
      [`POST ${ACCEPT_URL}`]: errorResponse(
        410,
        "invite_expired",
        "This invite has expired. Ask for a new one.",
      ),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invite has expired. Ask for a new one.",
    );
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in and back to this invite", async () => {
    mockFetch({
      [`POST ${ACCEPT_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Finvite%2Fabc123"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeEnabled();
  });
});
