import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("Badge", () => {
  it("shows its text with the default look", () => {
    renderPlain(<Badge>Written by Orbit</Badge>);
    expect(screen.getByText("Written by Orbit")).toHaveClass("bg-accent", "text-primary");
  });

  it("supports other variants", () => {
    renderPlain(<Badge variant="secondary">Draft</Badge>);
    expect(screen.getByText("Draft")).toHaveClass("bg-muted");
  });
});

describe("Avatar", () => {
  it("falls back to the given text when there is no image", () => {
    renderPlain(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("keeps the fallback when the image cannot load, and a picture that fills the circle", () => {
    const { container } = renderPlain(
      <Avatar>
        <AvatarImage src="/missing.webp" alt="" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = renderPlain(<Skeleton className="h-4 w-10" />);
    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toHaveClass("h-4", "w-10");
  });
});

describe("Separator", () => {
  it("is decorative by default", () => {
    const { container } = renderPlain(<Separator />);
    expect(container.firstElementChild).toHaveAttribute("role", "none");
  });

  it("can be a real separator", () => {
    renderPlain(<Separator decorative={false} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("supports a vertical orientation", () => {
    const { container } = renderPlain(<Separator orientation="vertical" />);
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "vertical");
  });
});
