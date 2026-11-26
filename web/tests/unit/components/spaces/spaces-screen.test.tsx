import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpacesScreen } from "@/components/spaces/spaces-screen";
import type { SpacesScreenProps } from "@/components/spaces/spaces-screen.types";
import type { SpacesResponse, SpaceSummaryWire } from "@/lib/api.types";
import {
  BLAKE,
  makeInvitation,
  makeQuietSpace,
  makeSpaceSummary,
} from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));

const goa = makeSpaceSummary({
  id: "goa",
  name: "Goa trip",
  last_activity_at: "2026-11-19T10:00:00Z",
});
const cabin = makeSpaceSummary({
  id: "cabin",
  name: "Cabin weekend",
  is_creator: false,
  owner_name: "Blake",
  members: [BLAKE],
  last_activity_at: "2026-11-18T10:00:00Z",
});
const alpha = makeQuietSpace({
  id: "alpha",
  name: "Alpha plans",
  last_activity_at: "2026-11-01T10:00:00Z",
});

function setup(overrides: Partial<SpacesScreenProps> = {}) {
  const props: SpacesScreenProps = {
    initial: { spaces: [goa, cabin, alpha] },
    initialInvitations: { invitations: [] },
    ...overrides,
  };
  return { props, ...renderWithProviders(<SpacesScreen {...props} />) };
}

function cardNames(): string[] {
  return screen
    .getAllByRole("article")
    .map((article) => article.getAttribute("aria-labelledby"))
    .map((id) => document.getElementById(id ?? "")?.textContent ?? "");
}

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("SpacesScreen", () => {
  it("names the page and summarises what is in it", () => {
    setup({ initialInvitations: { invitations: [makeInvitation()] } });

    expect(screen.getByRole("heading", { level: 1, name: "Spaces" })).toBeInTheDocument();
    expect(
      screen.getByText("3 spaces · 1 shared with you · 1 invitation waiting"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New space" })).toHaveLength(1);
  });

  it("lists every space as a card, most recently active first", () => {
    setup();

    const list = screen.getByRole("list", { name: "All spaces" });
    expect(within(list).getAllByRole("article")).toHaveLength(3);
    expect(cardNames()).toEqual(["Goa trip", "Cabin weekend", "Alpha plans"]);
    expect(within(list).getByRole("link", { name: "Cabin weekend" })).toHaveAttribute(
      "href",
      "/spaces/cabin",
    );
  });

  it("points people who use an assistant to the Assistants tab", () => {
    setup();
    expect(screen.getByRole("link", { name: "Connect it on the Assistants tab" })).toHaveAttribute(
      "href",
      "/assistants",
    );
  });

  it("announces how many spaces are showing", () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("3 spaces shown");
  });
});

describe("filters", () => {
  it("separates the spaces you own from the ones shared with you", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("tab", { name: /^Yours/ }));
    expect(screen.getByRole("list", { name: "Your spaces" })).toBeInTheDocument();
    expect(cardNames()).toEqual(["Goa trip", "Alpha plans"]);

    await user.click(screen.getByRole("tab", { name: /Shared with you/ }));
    expect(screen.getByRole("list", { name: "Shared with you" })).toBeInTheDocument();
    expect(cardNames()).toEqual(["Cabin weekend"]);

    await user.click(screen.getByRole("tab", { name: /^All/ }));
    expect(cardNames()).toHaveLength(3);
  });

  it("shows how many are in each group", () => {
    setup({ initialInvitations: { invitations: [makeInvitation()] } });

    expect(screen.getByRole("tab", { name: /^All/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /^Yours/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Shared with you/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("1");
  });

  it("keeps the address in step with the chosen group so a reload keeps it", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const { user } = setup();

    await user.click(screen.getByRole("tab", { name: /^Yours/ }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/spaces?tab=yours");

    await user.click(screen.getByRole("tab", { name: /^All/ }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/spaces");
  });

  it("opens on the group named in the address", () => {
    setup({ initialTab: "shared" });

    expect(screen.getByRole("tab", { name: /Shared with you/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(cardNames()).toEqual(["Cabin weekend"]);
  });
});

describe("pending spaces", () => {
  const invitations = [
    makeInvitation({ id: "i1", space_name: "Weekend in Lisbon" }),
    makeInvitation({ id: "i2", space_name: "Book club", invited_by: "Blake" }),
  ];

  it("shows waiting invitations above the spaces, so nobody has to find a link", () => {
    setup({ initialInvitations: { invitations } });

    const pending = screen.getByRole("list", { name: "Pending spaces" });
    expect(within(pending).getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "All spaces" })).toBeVisible();
    expect(
      pending.compareDocumentPosition(screen.getByRole("list", { name: "All spaces" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows only invitations on the Pending tab", async () => {
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("tab", { name: /Pending/ }));

    expect(screen.getByRole("list", { name: "Pending spaces" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "All spaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Goa trip" })).not.toBeInTheDocument();
  });

  it("keeps invitations out of Yours and Shared with you", async () => {
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("tab", { name: /^Yours/ }));

    expect(screen.queryByRole("list", { name: "Pending spaces" })).not.toBeInTheDocument();
  });

  it("shows a spaceless person their invitations instead of an empty page", () => {
    setup({ initial: { spaces: [] }, initialInvitations: { invitations } });

    expect(screen.getByRole("list", { name: "Pending spaces" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Start your first space" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Filter spaces" })).toBeInTheDocument();
  });

  it("joins an invitation, welcomes the person and opens the space", async () => {
    const mock = mockFetch({
      "POST /api/invitations/i1/accept": jsonResponse({
        space_id: "space-9",
        already_member: false,
      }),
    });
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("button", { name: "Join space Weekend in Lisbon" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/space-9"));
    expect(mock.callsTo("POST", "/api/invitations/i1/accept")).toHaveLength(1);
    expect(toasts.success).toHaveBeenCalledWith("You joined Weekend in Lisbon");
    expect(screen.queryByRole("article", { name: "Weekend in Lisbon" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Book club" })).toBeInTheDocument();
  });

  it("does not celebrate when the person was already in the space", async () => {
    mockFetch({
      "POST /api/invitations/i1/accept": jsonResponse({
        space_id: "space-9",
        already_member: true,
      }),
    });
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("button", { name: "Join space Weekend in Lisbon" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/space-9"));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("explains why an invitation could not be joined and keeps it", async () => {
    mockFetch({
      "POST /api/invitations/i1/accept": errorResponse(409, "limit_reached", "This space is full."),
    });
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("button", { name: "Join space Weekend in Lisbon" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This space is full.");
    expect(screen.getByRole("article", { name: "Weekend in Lisbon" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("declines an invitation after asking, and it disappears", async () => {
    const mock = mockFetch({ "POST /api/invitations/i2/decline": emptyResponse() });
    const { user } = setup({ initialInvitations: { invitations } });

    await user.click(screen.getByRole("button", { name: "Decline invitation to Book club" }));
    await user.click(screen.getByRole("button", { name: "Decline invitation" }));

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Book club" })).not.toBeInTheDocument(),
    );
    expect(mock.callsTo("POST", "/api/invitations/i2/decline")).toHaveLength(1);
    expect(toasts).toHaveBeenCalledWith("Declined the invitation to Book club");
    expect(screen.getByRole("article", { name: "Weekend in Lisbon" })).toBeInTheDocument();
  });

  it("goes back to the empty page once the last invitation is declined and there is nothing else", async () => {
    mockFetch({ "POST /api/invitations/i1/decline": emptyResponse() });
    const { user } = setup({
      initial: { spaces: [] },
      initialInvitations: { invitations: [invitations[0]!] },
    });

    await user.click(screen.getByRole("button", { name: /Decline invitation to/ }));
    await user.click(screen.getByRole("button", { name: "Decline invitation" }));

    expect(
      await screen.findByRole("heading", { name: "Start your first space" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("search", () => {
  it("narrows both spaces and invitations as people type", async () => {
    const { user } = setup({
      initialInvitations: {
        invitations: [
          makeInvitation({ id: "i1", space_name: "Goa friends" }),
          makeInvitation({ id: "i2", space_name: "Book club" }),
        ],
      },
    });

    await user.type(screen.getByRole("searchbox", { name: "Search spaces" }), "goa");

    expect(cardNames()).toEqual(["Goa friends", "Goa trip"]);
  });

  it("says nothing matched and lets people clear the search", async () => {
    const { user } = setup();

    await user.type(screen.getByRole("searchbox", { name: "Search spaces" }), "zzz");

    expect(screen.getByRole("heading", { name: "No spaces match “zzz”" })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all spaces" }));

    expect(cardNames()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Search spaces" })).toHaveValue("");
  });

  it("combines with the chosen group", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("tab", { name: /Shared with you/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search spaces" }), "goa");

    expect(screen.getByRole("heading", { name: "No spaces match “goa”" })).toBeInTheDocument();
  });
});

describe("order and layout", () => {
  it("can order by name and remembers the choice", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /Sort spaces/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Name" }));

    expect(cardNames()).toEqual(["Alpha plans", "Cabin weekend", "Goa trip"]);
    expect(window.localStorage.getItem("orbit-spaces-sort")).toBe("name");
  });

  it("starts from the order it remembered", () => {
    window.localStorage.setItem("orbit-spaces-sort", "name");
    setup();
    expect(cardNames()).toEqual(["Alpha plans", "Cabin weekend", "Goa trip"]);
  });

  it("switches to a compact list and remembers it", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "List view" }));

    expect(document.querySelectorAll('[data-slot="space-row"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-slot="space-card"]')).toHaveLength(0);
    expect(window.localStorage.getItem("orbit-spaces-layout")).toBe("list");

    await user.click(screen.getByRole("button", { name: "Grid view" }));

    expect(document.querySelectorAll('[data-slot="space-card"]')).toHaveLength(3);
  });
});

describe("empty states", () => {
  it("shows a helpful first-run page with the single primary action", () => {
    setup({ initial: { spaces: [] } });

    expect(screen.getByRole("heading", { name: "Start your first space" })).toBeInTheDocument();
    expect(screen.getByText(/share this to Orbit/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New space" })).toHaveLength(1);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("opens the new space dialog from the first-run page", async () => {
    const { user } = setup({ initial: { spaces: [] } });

    await user.click(screen.getByRole("button", { name: "New space" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens the new space dialog straight away when asked to", () => {
    setup({ openNewSpace: true });
    expect(screen.getByRole("dialog", { name: "What's this space for?" })).toBeInTheDocument();
  });

  const emptyGroups: [RegExp, SpacesResponse, string][] = [
    [/Shared with you/, { spaces: [goa] }, "Nothing shared with you yet"],
    [/^Yours/, { spaces: [cabin] }, "No spaces of your own yet"],
    [/^Pending/, { spaces: [goa] }, "No pending invitations"],
  ];

  it.each(emptyGroups)("explains the empty group %s", async (tab, initial, title) => {
    const { user } = setup({ initial });

    await user.click(screen.getByRole("tab", { name: tab }));

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});

describe("older servers", () => {
  it("still shows every space when the server does not send previews or invitations yet", () => {
    const older: SpaceSummaryWire = {
      id: "old",
      name: "Old space",
      created_at: "2026-11-01T09:00:00Z",
      is_creator: true,
      notify_email: true,
      members: [BLAKE],
    };

    setup({ initial: { spaces: [older] } });

    expect(screen.getByRole("article", { name: "Old space" })).toHaveTextContent(
      "Nothing shared yet",
    );
  });
});

describe("the created-spaces limit", () => {
  const spaces = [goa, cabin, alpha];

  it("shows how much of the limit is used", () => {
    setup({ initial: { spaces, limits: { created_spaces: 2, max_created_spaces: 5 } } });

    expect(screen.getByText(/2 of 5 spaces created/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New space" })).toBeEnabled();
  });

  it("turns New space off and explains why once the limit is reached", () => {
    setup({ initial: { spaces, limits: { created_spaces: 5, max_created_spaces: 5 } } });

    const button = screen.getByRole("button", { name: "New space" });
    expect(button).toBeDisabled();
    const reason = screen.getByText(
      "You have created 5 of 5 spaces on the free plan. Delete one to start another.",
    );
    expect(button).toHaveAccessibleDescription(reason.textContent ?? "");
  });

  it("says nothing about a limit when the server has none", () => {
    setup({ initial: { spaces, limits: { created_spaces: 3, max_created_spaces: null } } });

    expect(screen.queryByText(/spaces created/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New space" })).toBeEnabled();
  });
});
