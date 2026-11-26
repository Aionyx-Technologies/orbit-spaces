import { screen } from "@testing-library/react";
import { Tabs } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

import { FilterTabs } from "@/components/spaces/filter-tabs";
import type { SpaceTab } from "@/lib/space-filters.types";
import { renderPlain } from "@/tests/unit/helpers/render";

const counts = { all: 5, yours: 3, shared: 2, pending: 1 };

function setup(value: SpaceTab = "all", overrides: Partial<typeof counts> = {}) {
  const onValueChange = vi.fn();
  const view = renderPlain(
    <Tabs.Root value={value} onValueChange={onValueChange}>
      <FilterTabs value={value} counts={{ ...counts, ...overrides }} />
    </Tabs.Root>,
  );
  return { onValueChange, ...view };
}

describe("FilterTabs", () => {
  it("offers All, Yours, Shared with you and Pending, each with its count", () => {
    setup();

    const list = screen.getByRole("tablist", { name: "Filter spaces" });
    const tabs = screen.getAllByRole("tab");
    expect(list).toBeInTheDocument();
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "All5",
      "Yours3",
      "Shared with you2",
      "Pending1",
    ]);
  });

  it("marks the chosen tab as selected", () => {
    setup("shared");

    expect(screen.getByRole("tab", { name: /Shared with you/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "false");
  });

  it("reports a click on another tab", async () => {
    const { user, onValueChange } = setup();

    await user.click(screen.getByRole("tab", { name: /Yours/ }));

    expect(onValueChange).toHaveBeenCalledWith("yours");
  });

  it("moves between tabs with the arrow keys", async () => {
    const { user, onValueChange } = setup();

    await user.click(screen.getByRole("tab", { name: /^All/ }));
    onValueChange.mockClear();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: /Yours/ })).toHaveFocus();
    expect(onValueChange).toHaveBeenCalledWith("yours");

    await user.keyboard("{End}");

    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveFocus();
  });

  it("draws a sliding highlight behind the chosen tab", () => {
    const { container } = setup("yours");

    expect(container.querySelector('[data-slot="tab-indicator"]')).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toHaveAttribute("data-measured", "true");
  });

  it("calls attention to waiting invitations only when there are some", () => {
    const { unmount } = setup("all", { pending: 7 });
    expect(screen.getByText("7")).toHaveClass("bg-ember");
    unmount();

    setup("all", { pending: 0 });
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("0");
    expect(screen.getByRole("tab", { name: /Pending/ }).querySelector(".bg-ember")).toBeNull();
  });
});
