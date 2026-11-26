import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/command/command-palette";
import { THEME_COOKIE } from "@/lib/theme";
import { makeInvitation, makeQuietSpace, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const goa = makeSpaceSummary({ id: "goa", name: "Goa trip" });
const cabin = makeQuietSpace({
  id: "cabin",
  name: "Cabin weekend",
  is_creator: false,
  owner_name: "Blake",
  last_activity_at: "2026-11-02T10:00:00Z",
});

function serve() {
  return mockFetch({
    "GET /api/spaces": jsonResponse({ spaces: [goa, cabin] }),
    "GET /api/invitations": jsonResponse({ invitations: [makeInvitation()] }),
  });
}

async function openPalette() {
  const view = renderWithProviders(<CommandPalette />);
  await view.user.click(screen.getByRole("button", { name: "Search or jump to…" }));
  await screen.findByRole("option", { name: /Goa trip/ });
  await screen.findByRole("option", { name: /Review invitation to/ });
  return view;
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});

describe("CommandPalette", () => {
  it("does not ask the server for anything until it is opened", async () => {
    const mock = serve();

    renderWithProviders(<CommandPalette />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mock.calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Search or jump to…" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+K Meta+K",
    );
  });

  it("opens from its button and groups invitations, spaces and actions", async () => {
    serve();
    await openPalette();

    expect(screen.getByRole("dialog", { name: "Search and commands" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Review invitation to Weekend in Lisbon/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Cabin weekend/ })).toHaveTextContent(
      "Shared by Blake",
    );
  });

  it("opens and closes with Ctrl+K and Cmd+K", async () => {
    serve();
    const { user } = renderWithProviders(<CommandPalette />);

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Search and commands" })).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("dialog", { name: "Search and commands" })).toBeInTheDocument();
  });

  it("is a labelled combobox that points at the highlighted option", async () => {
    serve();
    await openPalette();

    const input = screen.getByRole("combobox", { name: "Search spaces or run a command" });
    const list = screen.getByRole("listbox", { name: "Results" });
    expect(input).toHaveAttribute("aria-controls", list.id);
    const selected = within(list).getAllByRole("option", { selected: true });
    expect(selected).toHaveLength(1);
    expect(input).toHaveAttribute("aria-activedescendant", selected[0]?.id);
  });

  it("filters as people type and says when nothing matches", async () => {
    serve();
    const { user } = await openPalette();
    const input = screen.getByRole("combobox");

    await user.type(input, "cabin");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Cabin weekend/ })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "zzzz");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No results for “zzzz”");
  });

  it("moves with the arrow keys, wraps around and opens the highlighted space on Enter", async () => {
    serve();
    const { user } = await openPalette();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /Goa trip/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowUp}{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options.at(-1)).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(router.push).toHaveBeenCalledWith("/spaces/goa");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens a result when it is clicked", async () => {
    serve();
    const { user } = await openPalette();

    await user.click(screen.getByRole("option", { name: /Open settings/ }));

    expect(router.push).toHaveBeenCalledWith("/settings");
  });

  it("offers the Assistants page next to Settings", async () => {
    serve();
    const { user } = await openPalette();

    const options = screen.getAllByRole("option").map((option) => option.textContent ?? "");
    const assistants = options.findIndex((text) => /Open assistants/.test(text));
    const settings = options.findIndex((text) => /Open settings/.test(text));
    expect(assistants).toBeGreaterThanOrEqual(0);
    expect(settings).toBe(assistants + 1);

    await user.click(screen.getByRole("option", { name: /Open assistants/ }));

    expect(router.push).toHaveBeenCalledWith("/assistants");
  });

  it("highlights what the pointer is over", async () => {
    serve();
    const { user } = await openPalette();

    await user.hover(screen.getByRole("option", { name: /Cabin weekend/ }));

    expect(screen.getByRole("option", { name: /Cabin weekend/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("takes people to their waiting invitations and to a new space", async () => {
    serve();
    const { user } = await openPalette();

    await user.click(screen.getByRole("option", { name: /Review invitation to/ }));
    expect(router.push).toHaveBeenLastCalledWith("/spaces?tab=pending");

    await user.keyboard("{Control>}k{/Control}");
    await user.click(await screen.findByRole("option", { name: /New space/ }));
    expect(router.push).toHaveBeenLastCalledWith("/spaces?new=1");
  });

  it("switches the theme without leaving the page", async () => {
    serve();
    const { user } = await openPalette();

    await user.type(screen.getByRole("combobox"), "dark");
    await user.keyboard("{Enter}");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("forgets the search when it is closed", async () => {
    serve();
    const { user } = await openPalette();
    await user.type(screen.getByRole("combobox"), "cabin");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("combobox")).toHaveValue("");
  });
});
