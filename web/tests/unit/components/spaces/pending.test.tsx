import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { PendingCard } from "@/components/spaces/pending-card";
import type { PendingCardProps } from "@/components/spaces/pending-card.types";
import { PendingSection } from "@/components/spaces/pending-section";
import { ApiError } from "@/lib/api";
import { makeInvitation } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces"),
}));

vi.mock("@/lib/navigation", () => navigation);

function setup(overrides: Partial<PendingCardProps> = {}) {
  const props: PendingCardProps = {
    invitation: makeInvitation(),
    onAccept: vi.fn().mockResolvedValue(undefined),
    onDecline: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { props, ...renderPlain(<PendingCard {...props} />) };
}

describe("PendingCard", () => {
  it("is an article named after the space, saying who invited you and what happens next", () => {
    // The fixture expires on a fixed date, so pin the clock to a day before it.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T09:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    setup();

    const card = screen.getByRole("article", { name: "Weekend in Lisbon" });
    expect(card).toHaveTextContent("Alex invited you");
    expect(card).toHaveTextContent(/expires/);
    expect(within(card).getByText("Private until you join")).toBeInTheDocument();
    expect(within(card).getByText("Invitation")).toBeInTheDocument();
  });

  it("copes with an invitation from someone whose account is gone", () => {
    setup({ invitation: makeInvitation({ invited_by: null }) });
    expect(screen.getByRole("article")).toHaveTextContent("Someone invited you");
  });

  it("gives each button a name that says which space it is about", () => {
    setup();

    expect(screen.getByRole("button", { name: "Join space Weekend in Lisbon" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Decline invitation to Weekend in Lisbon" }),
    ).toBeEnabled();
  });

  it("joins when asked and shows that it is working", async () => {
    let finish: () => void = () => undefined;
    const onAccept = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { user, props } = setup({ onAccept });

    await user.click(screen.getByRole("button", { name: /Join space/ }));

    expect(onAccept).toHaveBeenCalledWith(props.invitation);
    expect(screen.getByRole("button", { name: /Join space/ })).toHaveTextContent("Joining…");
    expect(screen.getByRole("button", { name: /Join space/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Decline invitation/ })).toBeDisabled();
    expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
    finish();
  });

  it("says what went wrong and lets the person try again", async () => {
    const onAccept = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "limit_reached", "This space is full."))
      .mockResolvedValueOnce(undefined);
    const { user } = setup({ onAccept });

    await user.click(screen.getByRole("button", { name: /Join space/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This space is full.");
    expect(screen.getByRole("button", { name: /Join space/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Join space/ }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onAccept).toHaveBeenCalledTimes(2);
  });

  it("sends someone whose session ended back to sign in", async () => {
    const onAccept = vi.fn().mockRejectedValue(new ApiError(401, "unauthenticated", "Sign in."));
    const { user } = setup({ onAccept });

    await user.click(screen.getByRole("button", { name: /Join space/ }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks before declining and can be backed out of", async () => {
    const { user, props } = setup();

    await user.click(screen.getByRole("button", { name: /Decline invitation to/ }));

    const dialog = screen.getByRole("alertdialog", { name: "Decline this invitation?" });
    expect(dialog).toHaveTextContent("Alex invited you to Weekend in Lisbon.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(props.onDecline).not.toHaveBeenCalled();
  });

  it("declines once confirmed and closes the question", async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole("button", { name: /Decline invitation to/ }));

    await user.click(screen.getByRole("button", { name: "Decline invitation" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(props.onDecline).toHaveBeenCalledWith(props.invitation);
  });

  it("keeps the question open and explains when declining fails", async () => {
    const onDecline = vi.fn().mockRejectedValue(new ApiError(500, "error", "Could not decline."));
    const { user } = setup({ onDecline });
    await user.click(screen.getByRole("button", { name: /Decline invitation to/ }));

    await user.click(screen.getByRole("button", { name: "Decline invitation" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Could not decline.");
  });

  it("has a compact form for the list layout", () => {
    setup({ compact: true });

    expect(screen.getByRole("article")).not.toHaveTextContent("Private until you join");
    expect(screen.getByRole("button", { name: /Join space/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline invitation to/ })).toBeInTheDocument();
  });

  it("staggers its entrance by its position in the list", () => {
    setup({ index: 2 });
    expect(screen.getByRole("article").style.getPropertyValue("--i")).toBe("2");
  });
});

describe("PendingSection", () => {
  const invitations = [
    makeInvitation({ id: "a", space_name: "Weekend in Lisbon" }),
    makeInvitation({ id: "b", space_name: "Book club", invited_by: "Blake" }),
  ];

  it("names the section, counts what is waiting and lists every invitation", () => {
    renderPlain(
      <PendingSection
        invitations={invitations}
        layout="grid"
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Pending spaces" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Pending spaces" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(within(list).getByRole("article", { name: "Book club" })).toBeInTheDocument();
  });

  it("hands each action back with the invitation it was about", async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    const { user } = renderPlain(
      <PendingSection
        invitations={invitations}
        layout="list"
        onAccept={onAccept}
        onDecline={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Join space Book club" }));

    expect(onAccept).toHaveBeenCalledWith(invitations[1]);
  });
});
