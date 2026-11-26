import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renderPlain } from "@/tests/unit/helpers/render";

function Example({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Options">...</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Space</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onSelect}>Export</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("opens with the keyboard and lists its items", async () => {
    const { user } = renderPlain(<Example onSelect={vi.fn()} />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(screen.getByText("Space")).toBeInTheDocument();
  });

  it("moves between items with the arrow keys and selects with Enter", async () => {
    const onSelect = vi.fn();
    const { user } = renderPlain(<Example onSelect={onSelect} />);
    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menuitem", { name: "Export" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes with Escape and gives focus back", async () => {
    const { user } = renderPlain(<Example onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Options" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toHaveFocus();
  });

  it("selects with a click", async () => {
    const onSelect = vi.fn();
    const { user } = renderPlain(<Example onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Options" }));

    await user.click(screen.getByRole("menuitem", { name: "Export" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
