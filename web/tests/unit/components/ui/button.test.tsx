import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "@/components/ui/button";
import { renderPlain } from "@/tests/unit/helpers/render";
import { screen } from "@testing-library/react";

describe("Button", () => {
  it("renders a button that can be clicked", async () => {
    const onClick = vi.fn();
    const { user } = renderPlain(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("can be activated with the keyboard", async () => {
    const onClick = vi.fn();
    const { user } = renderPlain(<Button onClick={onClick}>Save</Button>);

    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does nothing when disabled", async () => {
    const onClick = vi.fn();
    const { user } = renderPlain(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("applies the variant and size classes", () => {
    renderPlain(
      <Button variant="destructive" size="sm">
        Delete
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveClass("bg-destructive", "h-9");
  });

  it("uses the primary look by default", () => {
    renderPlain(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass("bg-primary", "h-11");
  });

  it("lets a custom class override the defaults", () => {
    renderPlain(<Button className="h-20">Tall</Button>);
    expect(screen.getByRole("button", { name: "Tall" })).toHaveClass("h-20");
    expect(screen.getByRole("button", { name: "Tall" })).not.toHaveClass("h-11");
  });

  it("can style a link as a button", () => {
    renderPlain(
      <Button asChild variant="outline">
        <a href="/help">Help</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Help" });
    expect(link).toHaveAttribute("href", "/help");
    expect(link).toHaveClass("border");
  });

  it("exposes the variants for other elements", () => {
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg-accent");
    expect(buttonVariants({ size: "lg" })).toContain("h-12");
  });
});
