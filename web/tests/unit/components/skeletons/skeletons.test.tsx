import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
import { AssistantsSkeleton } from "@/components/skeletons/assistants-skeleton";
import { InviteSkeleton } from "@/components/skeletons/invite-skeleton";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { ShellSkeleton } from "@/components/skeletons/shell-skeleton";
import { SpaceSkeleton } from "@/components/skeletons/space-skeleton";
import { SpacesSkeleton } from "@/components/skeletons/spaces-skeleton";
import { navItemClass } from "@/lib/main-nav";
import { LOGO_LINK_CLASS } from "@/lib/shell";
import { renderPlain } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const me = { display_name: "Alex Smith", email: "alex@example.com" };

function skeletonBlocks(container: HTMLElement) {
  return container.querySelectorAll('[data-slot="skeleton"]');
}

describe("ShellSkeleton", () => {
  it("looks like the real page frame and tells assistive technology it is loading", () => {
    renderPlain(
      <ShellSkeleton>
        <p>Placeholder content</p>
      </ShellSkeleton>,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("Orbit");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(main).toHaveTextContent("Placeholder content");
  });

  it("is wide by default and can be narrow, like the real shell", () => {
    const { rerender } = renderPlain(
      <ShellSkeleton>
        <p>x</p>
      </ShellSkeleton>,
    );
    expect(screen.getByRole("main")).toHaveClass("max-w-5xl");

    rerender(
      <ShellSkeleton width="narrow">
        <p>x</p>
      </ShellSkeleton>,
    );
    expect(screen.getByRole("main")).toHaveClass("max-w-2xl");
  });

  it("has no links or buttons to tab through while loading", () => {
    renderPlain(
      <ShellSkeleton>
        <p>x</p>
      </ShellSkeleton>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the same tabs as the real header, hidden from assistive technology", () => {
    const { container: real } = renderPlain(<AppHeader me={me} current="assistants" />);
    const realTabs = Array.from(real.querySelectorAll("nav a"));
    const { container } = renderPlain(
      <ShellSkeleton current="assistants">
        <p>x</p>
      </ShellSkeleton>,
    );
    const placeholderTabs = Array.from(
      container.querySelectorAll("header [aria-hidden='true'] > span"),
    );

    expect(placeholderTabs.map((tab) => tab.textContent)).toEqual(
      realTabs.map((tab) => tab.textContent),
    );
    expect(placeholderTabs.map((tab) => tab.className)).toEqual([
      navItemClass(false, false),
      navItemClass(true, false),
    ]);
  });

  it("marks no tab as the current one when it does not know the page", () => {
    const { container } = renderPlain(
      <ShellSkeleton>
        <p>x</p>
      </ShellSkeleton>,
    );
    const tabs = Array.from(container.querySelectorAll("header [aria-hidden='true'] > span"));

    expect(tabs.map((tab) => tab.className)).toEqual([
      navItemClass(false, false),
      navItemClass(false, false),
    ]);
  });

  it("holds the logo in the same kind of box as the real header, so it stays put when the page arrives", () => {
    const { container: real } = renderPlain(<AppHeader me={me} current="spaces" />);
    const { container } = renderPlain(
      <ShellSkeleton>
        <p>x</p>
      </ShellSkeleton>,
    );
    const logoBox = (root: HTMLElement) =>
      root.querySelector("header > div > div")?.firstElementChild;

    expect(logoBox(real)?.tagName).toBe("A");
    expect(logoBox(container)?.className).toBe(logoBox(real)?.className);
    expect(logoBox(container)?.className).toBe(LOGO_LINK_CLASS);
    expect(logoBox(container)?.querySelector("svg")).toBeInTheDocument();
  });

  it("has the same width and the same space for search, theme and account as the real header", () => {
    const { container: real } = renderPlain(<AppHeader me={me} current="spaces" />);
    const { container } = renderPlain(
      <ShellSkeleton>
        <p>x</p>
      </ShellSkeleton>,
    );
    const realRow = real.querySelector("header > div");
    const row = container.querySelector("header > div");

    expect(row?.className).toBe(realRow?.className);
    expect(row?.lastElementChild?.className).toBe(realRow?.lastElementChild?.className);
  });
});

describe("InviteSkeleton", () => {
  it("is the busy main landmark with a loading announcement", () => {
    const { container } = renderPlain(<InviteSkeleton />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(main).toHaveTextContent("Orbit");
    expect(skeletonBlocks(container).length).toBeGreaterThan(2);
  });
});

describe.each([
  ["SpacesSkeleton", SpacesSkeleton],
  ["SpaceSkeleton", SpaceSkeleton],
  ["SettingsSkeleton", SettingsSkeleton],
  ["AssistantsSkeleton", AssistantsSkeleton],
])("%s", (_name, Skeleton) => {
  it("is made of hidden placeholder blocks and nothing a person could interact with", () => {
    const { container } = renderPlain(<Skeleton />);

    const blocks = skeletonBlocks(container);
    expect(blocks.length).toBeGreaterThan(3);
    for (const block of blocks) {
      expect(block).toHaveAttribute("aria-hidden", "true");
    }
    expect(container).toHaveTextContent("");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
