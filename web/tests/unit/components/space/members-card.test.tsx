import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembersCard } from "@/components/space/members-card";
import type { MembersCardProps } from "@/components/space/members-card.types";
import type { WaitingInvite } from "@/lib/api.types";
import { ALEX, BLAKE, makeMember } from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const MEMBERSHIP_URL = "/api/spaces/space-1/membership";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

function setup(overrides: Partial<MembersCardProps> = {}) {
  const props: MembersCardProps = {
    spaceId: "space-1",
    members: [ALEX, BLAKE],
    ownerId: ALEX.user_id,
    notifyEmail: true,
    frequency: "instant",
    onNotifyChanged: vi.fn(),
    ...overrides,
  };
  return { props, ...renderPlain(<MembersCard {...props} />) };
}

describe("MembersCard", () => {
  beforeEach(() => {
    stubImage({ width: 256, height: 256 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists everyone and marks you", () => {
    setup();

    const region = screen.getByRole("region", { name: "Members" });
    const list = within(region).getByRole("list", { name: "2 members" });
    const people = within(list).getAllByRole("listitem");
    expect(people).toHaveLength(2);
    expect(within(people[0] as HTMLElement).getByText("(you)")).toBeInTheDocument();
    expect(within(people[1] as HTMLElement).queryByText("(you)")).not.toBeInTheDocument();
    expect(people[1]).toHaveTextContent("Blake");
  });

  it("uses the singular for one member", () => {
    setup({ members: [ALEX] });

    expect(screen.getByRole("list", { name: "1 member" })).toBeInTheDocument();
  });

  it("keeps a very long name from breaking the layout", () => {
    setup({ members: [makeMember({ display_name: "Alexandria ".repeat(20), is_you: false })] });

    expect(screen.getAllByRole("listitem")[0]?.querySelector("span.truncate")).not.toBeNull();
  });

  describe("photos and profile cards", () => {
    it("shows each member's photo, and the initial for someone without one", async () => {
      const { container } = setup({
        members: [
          { ...ALEX, avatar_url: "/api/users/user-alex/avatar?v=1" },
          { ...BLAKE, avatar_url: null },
        ],
      });

      await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(1));
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "/api/users/user-alex/avatar?v=1",
      );
      expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("gives every member a button that opens their card, reachable with the keyboard", async () => {
      const { user } = setup({ members: [ALEX, { ...BLAKE, about: "Window seat, always." }] });

      await user.tab();
      expect(screen.getByRole("button", { name: "Your profile" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole("button", { name: "Blake's profile" })).toHaveFocus();
      await user.keyboard("{Enter}");

      expect(await screen.findByRole("dialog", { name: "Blake's profile" })).toHaveTextContent(
        "Window seat, always.",
      );
    });

    it("marks the owner in the card", async () => {
      const { user } = setup({ ownerId: BLAKE.user_id });

      await user.click(screen.getByRole("button", { name: "Blake's profile" }));

      expect(await screen.findByRole("dialog")).toHaveTextContent("Owner");
    });

    it("shows the about line as plain text", async () => {
      const { user } = setup({ members: [{ ...BLAKE, about: "<i>quietly</i>" }] });

      await user.click(screen.getByRole("button", { name: "Blake's profile" }));

      const card = await screen.findByRole("dialog");
      expect(card).toHaveTextContent("<i>quietly</i>");
      expect(card.querySelector("i")).toBeNull();
    });
  });

  describe("the email switch", () => {
    it("offers Email me about this space, set to the person's choice", () => {
      setup({ notifyEmail: false });

      const region = screen.getByRole("region", { name: "Members" });
      expect(
        within(region).getByRole("switch", { name: "Email me about this space" }),
      ).not.toBeChecked();
    });

    it("changes the same setting the settings page does and reports the new value", async () => {
      const mock = mockFetch({
        [`PATCH ${MEMBERSHIP_URL}`]: jsonResponse({ notify_email: false }),
      });
      const { user, props } = setup();

      await user.click(screen.getByRole("switch", { name: "Email me about this space" }));

      await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications off"));
      expect(mock.callsTo("PATCH", MEMBERSHIP_URL)[0]?.json).toEqual({ notify_email: false });
      expect(props.onNotifyChanged).toHaveBeenCalledWith(false);
    });

    it("is replaced by a pointer to Settings when emails are off for the account", () => {
      setup({ frequency: "off" });

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Change that in Settings" })).toHaveAttribute(
        "href",
        "/settings",
      );
    });
  });
  describe("people who are invited but have not joined", () => {
    const DAY = 86_400_000;
    const pending: WaitingInvite = {
      id: "inv-pending",
      email: "dana@example.com",
      invited_by: "Alex",
      invited_at: new Date(Date.now() - 2 * DAY).toISOString(),
      expires_at: new Date(Date.now() + 5 * DAY + 60_000).toISOString(),
      status: "pending",
    };
    const expired: WaitingInvite = {
      id: "inv-expired",
      email: "eli@example.com",
      invited_by: "Alex",
      invited_at: new Date(Date.now() - 9 * DAY).toISOString(),
      expires_at: new Date(Date.now() - 2 * DAY).toISOString(),
      status: "expired",
    };

    it("shows nothing extra when nobody is waiting", () => {
      setup();

      expect(screen.queryByRole("heading", { name: "Waiting to join" })).not.toBeInTheDocument();
    });

    it("lists each waiting invite apart from the members, with when it expires", () => {
      setup({ invites: [pending, expired] });

      expect(screen.getByRole("list", { name: "2 members" })).toBeInTheDocument();
      const list = screen.getByRole("list", { name: "2 invites" });
      const [first, second] = within(list).getAllByRole("listitem") as HTMLElement[];
      expect(first).toHaveTextContent("dana@example.com");
      expect(first).toHaveTextContent("Invited 2 days ago · expires in 5 days");
      expect(second).toHaveTextContent("eli@example.com");
      expect(second).toHaveTextContent("Expired");
    });

    it("offers Resend while an invite is live and Re-invite once it has expired", () => {
      setup({ invites: [pending, expired] });

      expect(
        screen.getByRole("button", { name: "Resend the invite to dana@example.com" }),
      ).toHaveTextContent("Resend");
      expect(screen.getByRole("button", { name: "Re-invite eli@example.com" })).toHaveTextContent(
        "Re-invite",
      );
    });

    it("re-invites, says so, and asks the space to refresh", async () => {
      const mock = mockFetch({
        "POST /api/spaces/space-1/invites/inv-expired/resend": jsonResponse(
          { url: "https://orbit.test/invite/new", expires_at: pending.expires_at, emailed: true },
          201,
        ),
      });
      const onInvitesChanged = vi.fn();
      const { user } = setup({ invites: [expired], onInvitesChanged });

      await user.click(screen.getByRole("button", { name: "Re-invite eli@example.com" }));

      await waitFor(() => expect(onInvitesChanged).toHaveBeenCalled());
      expect(mock.calls).toHaveLength(1);
      expect(toasts.success).toHaveBeenCalledWith("Sent a new invite to eli@example.com");
    });

    it("cancels an invite", async () => {
      mockFetch({ "DELETE /api/spaces/space-1/invites/inv-pending": emptyResponse() });
      const onInvitesChanged = vi.fn();
      const { user } = setup({ invites: [pending], onInvitesChanged });

      await user.click(
        screen.getByRole("button", { name: "Cancel the invite to dana@example.com" }),
      );

      await waitFor(() => expect(onInvitesChanged).toHaveBeenCalled());
      expect(toasts.success).toHaveBeenCalledWith("Cancelled the invite to dana@example.com");
    });

    it("explains a failure and refreshes, in case the invite was already accepted", async () => {
      mockFetch({
        "POST /api/spaces/space-1/invites/inv-pending/resend": errorResponse(
          404,
          "invite_not_found",
          "That invite is no longer waiting. It may have been accepted or cancelled.",
        ),
      });
      const onInvitesChanged = vi.fn();
      const { user } = setup({ invites: [pending], onInvitesChanged });

      await user.click(
        screen.getByRole("button", { name: "Resend the invite to dana@example.com" }),
      );

      await waitFor(() =>
        expect(toasts.error).toHaveBeenCalledWith(
          "That invite is no longer waiting. It may have been accepted or cancelled.",
        ),
      );
      expect(onInvitesChanged).toHaveBeenCalled();
    });
  });
});
