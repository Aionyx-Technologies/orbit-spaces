import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InviteScreen } from "@/components/invite/invite-screen";
import { InviteShell } from "@/components/invite/invite-shell";
import { InviteUnavailable } from "@/components/invite/invite-unavailable";
import type { InviteProblem } from "@/components/invite/invite-unavailable.types";
import { makeInviteView } from "@/tests/unit/helpers/fixtures";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("InviteShell", () => {
  it("is the main landmark, shows the logo and holds the content in a card", () => {
    renderPlain(
      <InviteShell>
        <p>Inside the card</p>
      </InviteShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(within(main).getByText("Orbit")).toBeInTheDocument();
    expect(within(main).getByText("Inside the card")).toBeInTheDocument();
  });
});

describe("InviteUnavailable", () => {
  it.each([
    [
      "not_found",
      "This invite link isn't valid",
      "Check that you copied the whole link, or ask for a new one.",
    ],
    ["expired", "This invite has expired", "Invites work for 7 days. Ask Blake for a new one."],
    [
      "used",
      "This invite was already used",
      "Each invite link works once. Ask Blake for a new one.",
    ],
    ["revoked", "This invite is no longer valid", "Ask Blake for a new one."],
    [
      "error",
      "We couldn't check this invite",
      "Something went wrong on our side. Try again in a moment.",
    ],
  ] as const satisfies readonly (readonly [InviteProblem, string, string])[])(
    "explains a %s invite and what to do next",
    (problem, title, text) => {
      renderPlain(<InviteUnavailable problem={problem} inviter="Blake" />);

      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to Orbit" })).toHaveAttribute("href", "/");
    },
  );

  it("does not make up a name when the inviter is unknown", () => {
    renderPlain(<InviteUnavailable problem="expired" inviter={null} />);

    expect(
      screen.getByText("Invites work for 7 days. Ask the person who invited you for a new one."),
    ).toBeInTheDocument();
  });

  it("falls back to a generic description when no inviter is given at all", () => {
    renderPlain(<InviteUnavailable problem="used" />);

    expect(screen.getByText(/Ask the person who invited you/)).toBeInTheDocument();
  });
});

describe("InviteScreen", () => {
  it("invites a signed-out person to sign in, naming who invited them", () => {
    renderPlain(<InviteScreen token="abc123" invite={makeInviteView()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Blake invited you to Goa trip" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sign in to join/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invite" })).not.toBeInTheDocument();
  });

  describe("who invited you", () => {
    const PHOTO = "/api/invites/abc123/inviter-avatar?v=5";

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows the inviter's photo above the heading, so the person can recognise them", async () => {
      stubImage({ width: 256, height: 256 });
      const { container } = renderPlain(
        <InviteScreen token="abc123" invite={makeInviteView({ inviter_avatar_url: PHOTO })} />,
      );

      await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", PHOTO));
      const heading = screen.getByRole("heading", { level: 1 });
      expect(
        (container.querySelector("img") as HTMLElement).compareDocumentPosition(heading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("keeps the photo decorative, because the heading already names the inviter", async () => {
      stubImage({ width: 256, height: 256 });
      const { container } = renderPlain(
        <InviteScreen token="abc123" invite={makeInviteView({ inviter_avatar_url: PHOTO })} />,
      );

      await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
      expect(container.querySelector("img")).toHaveAttribute("alt", "");
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows the inviter's initial when they have no photo", () => {
      const { container } = renderPlain(
        <InviteScreen token="abc123" invite={makeInviteView({ inviter_avatar_url: null })} />,
      );

      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("shows no picture when nobody is recorded as the inviter", () => {
      const { container } = renderPlain(
        <InviteScreen token="abc123" invite={makeInviteView({ invited_by: null })} />,
      );

      expect(container.querySelector("[data-slot='avatar']")).toBeNull();
    });

    it("shows no picture of the inviter to someone who is already in the space", () => {
      const { container } = renderPlain(
        <InviteScreen
          token="abc123"
          invite={makeInviteView({
            already_member: true,
            signed_in: true,
            inviter_avatar_url: PHOTO,
          })}
        />,
      );

      expect(container.querySelector("[data-slot='avatar']")).toBeNull();
    });
  });

  it("goes straight to accepting for someone who is signed in", () => {
    renderPlain(<InviteScreen token="abc123" invite={makeInviteView({ signed_in: true })} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Blake invited you to Goa trip" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invite" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sign in to join/)).not.toBeInTheDocument();
  });

  it("does not make up a name when nobody is recorded as the inviter", () => {
    renderPlain(<InviteScreen token="abc123" invite={makeInviteView({ invited_by: null })} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Someone invited you to Goa trip" }),
    ).toBeInTheDocument();
  });

  it("tells a member they are already in the space and offers to open it", () => {
    renderPlain(
      <InviteScreen
        token="abc123"
        invite={makeInviteView({ already_member: true, signed_in: true })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "You are already in Goa trip" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open space" })).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to join/)).not.toBeInTheDocument();
  });

  it("still lets a member in when the link itself has since expired", () => {
    renderPlain(
      <InviteScreen
        token="abc123"
        invite={makeInviteView({ already_member: true, signed_in: true, status: "expired" })}
      />,
    );

    expect(screen.getByRole("button", { name: "Open space" })).toBeInTheDocument();
    expect(screen.queryByText("This invite has expired")).not.toBeInTheDocument();
  });

  it.each([
    ["expired", "This invite has expired"],
    ["used", "This invite was already used"],
    ["revoked", "This invite is no longer valid"],
  ] as const)("shows an unavailable page for a %s invite", (status, title) => {
    renderPlain(<InviteScreen token="abc123" invite={makeInviteView({ status })} />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(/Ask Blake for a new one/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invite" })).not.toBeInTheDocument();
  });
});
