import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpaceGone } from "@/components/space/space-gone";
import { SpaceHeader } from "@/components/space/space-header";
import type { SpaceHeaderProps } from "@/components/space/space-header.types";
import { SpaceMenu } from "@/components/space/space-menu";
import { FAMILY_VACATION, makeSpaceDetail, makeTemplate } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderPlain, renderWithProviders } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));

function setupMenu(isCreator: boolean, spaceId = "space-1") {
  const onTemplateSaved = vi.fn();
  const view = renderWithProviders(
    <SpaceMenu
      spaceId={spaceId}
      spaceName="Goa trip"
      isCreator={isCreator}
      template={FAMILY_VACATION}
      onTemplateSaved={onTemplateSaved}
    />,
  );
  return { onTemplateSaved, ...view };
}

function setupHeader(overrides: Partial<SpaceHeaderProps> = {}) {
  const props: SpaceHeaderProps = {
    space: makeSpaceDetail(),
    status: "live",
    onTemplateSaved: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<SpaceHeader {...props} />) };
}

describe("SpaceMenu", () => {
  it("has one clearly named trigger that opens a menu", () => {
    setupMenu(true);

    expect(screen.getByRole("button", { name: "Space options" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("offers the export as a download link", async () => {
    const { user } = setupMenu(false);

    await user.click(screen.getByRole("button", { name: "Space options" }));

    const exportLink = screen.getByRole("menuitem", { name: "Export as JSON" });
    expect(exportLink).toHaveAttribute("href", "/api/spaces/space-1/export");
    expect(exportLink).toHaveAttribute("download");
  });

  it("encodes the space id in the export address", async () => {
    const { user } = setupMenu(false, "a b/c");

    await user.click(screen.getByRole("button", { name: "Space options" }));

    expect(screen.getByRole("menuitem", { name: "Export as JSON" })).toHaveAttribute(
      "href",
      "/api/spaces/a%20b%2Fc/export",
    );
  });

  it("only offers Delete to the person who created the space", async () => {
    const { user, unmount } = setupMenu(false);
    await user.click(screen.getByRole("button", { name: "Space options" }));
    expect(screen.queryByRole("menuitem", { name: "Delete space" })).not.toBeInTheDocument();
    unmount();

    const creator = setupMenu(true);
    await creator.user.click(screen.getByRole("button", { name: "Space options" }));
    expect(screen.getByRole("menuitem", { name: "Delete space" })).toBeInTheDocument();
  });

  it("asks before deleting and can be backed out of", async () => {
    const { user } = setupMenu(true);
    await user.click(screen.getByRole("button", { name: "Space options" }));

    await user.click(screen.getByRole("menuitem", { name: "Delete space" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete “Goa trip”?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("SpaceMenu template editing", () => {
  async function openEditor() {
    const view = setupMenu(false);
    await view.user.click(screen.getByRole("button", { name: "Space options" }));
    await view.user.click(screen.getByRole("menuitem", { name: "Edit template" }));
    return view;
  }

  it("lets any member open the template editor with the space template filled in", async () => {
    await openEditor();

    const dialog = screen.getByRole("dialog", { name: "Edit template" });
    expect(within(dialog).getByRole("textbox", { name: "Template name" })).toHaveValue("Trip");
    expect(within(dialog).getByRole("textbox", { name: "Fact 2 name" })).toHaveValue("Budget");
    expect(within(dialog).getByRole("textbox", { name: "Section 1" })).toHaveValue("Where to stay");
    expect(within(dialog).getByRole("textbox", { name: "Tip 3" })).toHaveValue("Add the dates");
  });

  it("saves the edited template with a PUT and hands the saved copy on", async () => {
    const saved = makeTemplate({ id: "trip", name: "Family trip" });
    const mock = mockFetch({ "PUT /api/spaces/space-1/template": jsonResponse(saved) });
    const { user, onTemplateSaved } = await openEditor();
    const name = screen.getByRole("textbox", { name: "Template name" });
    await user.clear(name);
    await user.type(name, "Family trip");

    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(onTemplateSaved).toHaveBeenCalledWith(saved));
    const body = mock.callsTo("PUT", "/api/spaces/space-1/template")[0]?.json as {
      name: string;
      plan_sections: string[];
    };
    expect(body.name).toBe("Family trip");
    expect(body.plan_sections.at(-1)).toBe("To settle");
    expect(toasts.success).toHaveBeenCalledWith("Template saved");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server message and keeps the editor open when saving fails", async () => {
    mockFetch({
      "PUT /api/spaces/space-1/template": errorResponse(
        422,
        "invalid_template",
        "A template can have at most 8 plan sections, counting To settle.",
      ),
    });
    const { user, onTemplateSaved } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Save template" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A template can have at most 8 plan sections, counting To settle.",
    );
    expect(onTemplateSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit template" })).toBeInTheDocument();
  });

  it("discards unsaved edits when it is closed and opened again", async () => {
    const { user } = await openEditor();
    await user.type(screen.getByRole("textbox", { name: "Template name" }), " extra");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Space options" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit template" }));

    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Trip");
  });
});

describe("SpaceHeader", () => {
  it("shows the space name as the page heading, with the full name on hover", () => {
    setupHeader({ space: makeSpaceDetail({ name: "Goa trip with the whole family" }) });

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Goa trip with the whole family");
    expect(heading).toHaveAttribute("title", "Goa trip with the whole family");
    expect(heading).toHaveClass("break-words");
  });

  it("shows the template description under the name, with the full text on hover", () => {
    const description = "Six friends planning a December week";
    setupHeader({ space: makeSpaceDetail({ template: makeTemplate({ description }) }) });

    const line = screen.getByText(description);
    expect(line).toHaveAttribute("title", description);
    expect(line).toHaveClass("truncate");
  });

  it("shows no description line when the description is empty", () => {
    const { container } = setupHeader({
      space: makeSpaceDetail({ template: makeTemplate({ description: "" }) }),
    });
    expect(container.querySelector("p[title]")).not.toBeInTheDocument();
  });

  it("links back to the list of spaces", () => {
    setupHeader();
    expect(screen.getByRole("link", { name: "Spaces" })).toHaveAttribute("href", "/spaces");
  });

  it("names the members for assistive technology", () => {
    setupHeader();
    expect(screen.getByRole("img", { name: "Alex, Blake" })).toBeInTheDocument();
  });

  it("opens the invite dialog from Invite", async () => {
    const { user } = setupHeader();

    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(screen.getByRole("dialog", { name: "Invite someone" })).toBeInTheDocument();
  });

  it("has the space options menu", () => {
    setupHeader();
    expect(screen.getByRole("button", { name: "Space options" })).toBeInTheDocument();
  });

  it("says when live updates are paused, and only then", () => {
    const { unmount } = setupHeader({ status: "offline" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Live updates are paused. Trying to reconnect…",
    );
    unmount();

    for (const status of ["live", "connecting"] as const) {
      const view = setupHeader({ status });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("SpaceGone", () => {
  it("explains what happened and offers the way back", () => {
    renderPlain(<SpaceGone />);

    expect(
      screen.getByRole("heading", { level: 1, name: "This space isn't available" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It may have been deleted, or you may no longer be a member."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your spaces" })).toHaveAttribute(
      "href",
      "/spaces",
    );
  });
});
