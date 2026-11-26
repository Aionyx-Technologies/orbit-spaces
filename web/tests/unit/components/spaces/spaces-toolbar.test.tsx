import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayoutToggle } from "@/components/spaces/layout-toggle";
import { SpacesSearch } from "@/components/spaces/spaces-search";
import { SpacesSort } from "@/components/spaces/spaces-sort";
import { SpacesToolbar } from "@/components/spaces/spaces-toolbar";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("SpacesSearch", () => {
  it("is a labelled search field that reports every keystroke", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<SpacesSearch value="" onChange={onChange} />);

    expect(screen.getByRole("search")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search spaces" }), "go");

    expect(onChange).toHaveBeenNthCalledWith(1, "g");
    expect(onChange).toHaveBeenNthCalledWith(2, "o");
  });

  it("offers to clear what was typed, and only then", async () => {
    const onChange = vi.fn();
    const { user, rerender } = renderPlain(<SpacesSearch value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    rerender(<SpacesSearch value="goa" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SpacesSort", () => {
  it("names the current order and lists the choices", async () => {
    const { user } = renderPlain(<SpacesSort value="activity" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /Sort spaces/ });
    expect(trigger).toHaveTextContent("Recent activity");
    await user.click(trigger);

    expect(screen.getByRole("menuitemradio", { name: "Recent activity" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Name" })).not.toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Date created" })).toBeInTheDocument();
  });

  it("reports the order that was chosen", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<SpacesSort value="activity" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Sort spaces/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Date created" }));

    expect(onChange).toHaveBeenCalledWith("created");
  });
});

describe("LayoutToggle", () => {
  it("shows which layout is on and switches to the other", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<LayoutToggle value="grid" onChange={onChange} />);

    expect(screen.getByRole("group", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "List view" }));

    expect(onChange).toHaveBeenCalledWith("list");
  });
});

describe("SpacesToolbar", () => {
  it("brings the search, the order and the layout together", () => {
    renderPlain(
      <SpacesToolbar
        query=""
        onQueryChange={vi.fn()}
        sort="name"
        onSortChange={vi.fn()}
        layout="list"
        onLayoutChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Search spaces" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort spaces/ })).toHaveTextContent("Name");
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
