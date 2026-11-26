import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import AssistantsPage, { metadata as assistantsMetadata } from "@/app/(app)/assistants/page";
import SettingsPage, { metadata as settingsMetadata } from "@/app/(app)/settings/page";
import SpacePage, { metadata as spaceMetadata } from "@/app/(app)/spaces/[id]/page";
import SpacesPage, { metadata as spacesMetadata } from "@/app/(app)/spaces/page";
import InvitePage, { metadata as inviteMetadata } from "@/app/invite/[token]/page";
import { FakeEventSource } from "@/tests/unit/helpers/fake-event-source";
import {
  makeConnection,
  makeInvitation,
  makeInviteView,
  makeItem,
  makeItemsPage,
  makeMe,
  makeSpaceDetail,
  makeSpaceSummary,
} from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

const serverApi = vi.hoisted(() => ({
  serverGet: vi.fn(),
  serverGetOptional: vi.fn(),
  serverGetOrDefault: vi.fn(),
  serverRequest: vi.fn(),
}));
const nextNavigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/server-api", () => serverApi);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function answer(responses: Record<string, unknown>) {
  serverApi.serverGet.mockImplementation(async (path: string) => {
    if (path in responses) {
      return responses[path];
    }
    throw new Error(`Unexpected server request for ${path}`);
  });
}

beforeEach(() => {
  serverApi.serverGet.mockReset();
  serverApi.serverGetOptional.mockReset();
  serverApi.serverGetOrDefault.mockReset();
  serverApi.serverGetOrDefault.mockResolvedValue({ invitations: [] });
  serverApi.serverRequest.mockReset();
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("home page", () => {
  it("shows the landing page to someone who is signed out", async () => {
    serverApi.serverGetOptional.mockResolvedValue(null);

    renderPlain(await HomePage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Work together across AI assistants" }),
    ).toBeInTheDocument();
    expect(serverApi.serverGetOptional).toHaveBeenCalledWith("/api/me");
    expect(nextNavigation.redirect).not.toHaveBeenCalled();
  });

  it("offers the demo people when the server has demo mode on", async () => {
    serverApi.serverGetOptional.mockResolvedValue(null);
    serverApi.serverRequest.mockResolvedValue({
      ok: true,
      data: { enabled: true, people: [{ key: "alex", name: "Alex" }] },
    });

    renderPlain(await HomePage());

    expect(screen.getByRole("button", { name: "Continue as Alex" })).toBeInTheDocument();
    expect(serverApi.serverRequest).toHaveBeenCalledWith("/api/demo");
  });

  it("still shows the landing page when the demo question cannot be answered", async () => {
    serverApi.serverGetOptional.mockResolvedValue(null);
    serverApi.serverRequest.mockRejectedValue(new Error("down"));

    renderPlain(await HomePage());

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Try the demo")).not.toBeInTheDocument();
  });

  it("sends a signed-in person straight to their spaces", async () => {
    serverApi.serverGetOptional.mockResolvedValue(makeMe());

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT /spaces");
  });
});

describe("spaces page", () => {
  const noParams = { searchParams: Promise.resolve({}) };

  function answerSpaces() {
    answer({
      "/api/me": makeMe(),
      "/api/spaces": {
        spaces: [makeSpaceSummary(), makeSpaceSummary({ id: "space-2", name: "Work stuff" })],
      },
    });
  }

  it("loads the person and their spaces and shows them inside the app frame", async () => {
    answerSpaces();

    renderPlain(await SpacesPage(noParams));

    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/me", "/spaces");
    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/spaces", "/spaces");
    expect(screen.getByRole("heading", { level: 1, name: "Spaces" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "All spaces" });
    expect(within(list).getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Spaces", current: "page" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl");
    expect(spacesMetadata.title).toBe("Spaces");
  });

  it("asks for waiting invitations and shows them as pending spaces", async () => {
    answerSpaces();
    serverApi.serverGetOrDefault.mockResolvedValue({ invitations: [makeInvitation()] });

    renderPlain(await SpacesPage(noParams));

    expect(serverApi.serverGetOrDefault).toHaveBeenCalledWith("/api/invitations", "/spaces", {
      invitations: [],
    });
    const pending = screen.getByRole("list", { name: "Pending spaces" });
    expect(within(pending).getByRole("article", { name: "Weekend in Lisbon" })).toBeInTheDocument();
  });

  it("opens on the group named in the address and ignores one it does not know", async () => {
    answerSpaces();
    const shared = renderPlain(
      await SpacesPage({ searchParams: Promise.resolve({ tab: "shared" }) }),
    );
    expect(screen.getByRole("tab", { name: /Shared with you/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    shared.unmount();

    renderPlain(await SpacesPage({ searchParams: Promise.resolve({ tab: "nonsense" }) }));
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the new space dialog when sent here to create one", async () => {
    answerSpaces();

    renderPlain(await SpacesPage({ searchParams: Promise.resolve({ new: "1" }) }));

    expect(screen.getByRole("dialog", { name: "What's this space for?" })).toBeInTheDocument();
  });

  it("lets a failed load propagate so the error page can show", async () => {
    serverApi.serverGet.mockRejectedValue(new Error("NEXT_REDIRECT /auth/sign-in?next=%2Fspaces"));

    await expect(SpacesPage(noParams)).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("space page", () => {
  it("loads the space, its feed and the person, and shows the space", async () => {
    answer({
      "/api/me": makeMe(),
      "/api/spaces/space-1": makeSpaceDetail(),
      "/api/spaces/space-1/items?limit=20": makeItemsPage([makeItem()]),
    });

    renderPlain(await SpacePage({ params: Promise.resolve({ id: "space-1" }) }));

    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/me", "/spaces/space-1");
    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/spaces/space-1", "/spaces/space-1");
    expect(serverApi.serverGet).toHaveBeenCalledWith(
      "/api/spaces/space-1/items?limit=20",
      "/spaces/space-1",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Goa trip" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Morning flight" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spaces", current: "page" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl");
    expect(FakeEventSource.latest.url).toBe("/api/spaces/space-1/events");
    expect(spaceMetadata.title).toBe("Space");
  });

  it("encodes an unusual id in every request and in the way back", async () => {
    answer({
      "/api/me": makeMe(),
      "/api/spaces/a%20b": makeSpaceDetail({ id: "a b" }),
      "/api/spaces/a%20b/items?limit=20": makeItemsPage([]),
    });

    renderPlain(await SpacePage({ params: Promise.resolve({ id: "a b" }) }));

    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/spaces/a%20b", "/spaces/a%20b");
    expect(serverApi.serverGet).toHaveBeenCalledWith(
      "/api/spaces/a%20b/items?limit=20",
      "/spaces/a%20b",
    );
  });

  it("lets a missing space propagate so the not found page can show", async () => {
    serverApi.serverGet.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(SpacePage({ params: Promise.resolve({ id: "gone" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("settings page", () => {
  it("loads the person and their spaces and shows the settings", async () => {
    answer({
      "/api/me": makeMe(),
      "/api/spaces": { spaces: [makeSpaceSummary()] },
    });

    renderPlain(await SettingsPage());

    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/me", "/settings");
    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/spaces", "/settings");
    expect(serverApi.serverGet).not.toHaveBeenCalledWith("/api/connections", expect.anything());
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings", current: "page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke ChatGPT" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-2xl");
    expect(settingsMetadata.title).toBe("Settings");
  });
});

describe("assistants page", () => {
  it("loads the person and their connections and shows the Assistants tab as selected", async () => {
    answer({
      "/api/me": makeMe(),
      "/api/connections": { connections: [makeConnection()] },
    });

    renderPlain(await AssistantsPage());

    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/me", "/assistants");
    expect(serverApi.serverGet).toHaveBeenCalledWith("/api/connections", "/assistants");
    expect(screen.getByRole("heading", { level: 1, name: "Assistants" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assistants", current: "page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-2xl");
    expect(assistantsMetadata.title).toBe("Assistants");
  });
});

describe("invite page", () => {
  it("shows the invitation for a valid link", async () => {
    serverApi.serverRequest.mockResolvedValue({ ok: true, data: makeInviteView() });

    renderPlain(await InvitePage({ params: Promise.resolve({ token: "abc123" }) }));

    expect(serverApi.serverRequest).toHaveBeenCalledWith("/api/invites/abc123");
    expect(
      screen.getByRole("heading", { level: 1, name: "Blake invited you to Goa trip" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(inviteMetadata.title).toBe("You're invited");
  });

  it("encodes an unusual token in the request", async () => {
    serverApi.serverRequest.mockResolvedValue({ ok: true, data: makeInviteView() });

    renderPlain(await InvitePage({ params: Promise.resolve({ token: "a/b" }) }));

    expect(serverApi.serverRequest).toHaveBeenCalledWith("/api/invites/a%2Fb");
  });

  it("says the link isn't valid when the server does not know it", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Invite not found.",
    });

    renderPlain(await InvitePage({ params: Promise.resolve({ token: "nope" }) }));

    expect(
      screen.getByRole("heading", { name: "This invite link isn't valid" }),
    ).toBeInTheDocument();
  });

  it("says it could not check the invite when the server fails", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: false,
      status: 500,
      code: "server_error",
      message: "Something broke.",
    });

    renderPlain(await InvitePage({ params: Promise.resolve({ token: "abc123" }) }));

    expect(
      screen.getByRole("heading", { name: "We couldn't check this invite" }),
    ).toBeInTheDocument();
  });
});
