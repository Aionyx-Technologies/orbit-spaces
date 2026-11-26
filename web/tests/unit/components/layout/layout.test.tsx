import { render, screen, waitFor, within } from "@testing-library/react";
import { SWRConfig, useSWRConfig, type Cache } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import { SkipLink } from "@/components/layout/skip-link";
import { LOGO_LINK_CLASS } from "@/lib/shell";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const me = { display_name: "Alex Smith", email: "alex@example.com" };

describe("AppHeader", () => {
  it("links the wordmark to your spaces and the avatar to settings", () => {
    renderPlain(<AppHeader me={me} current={null} />);

    expect(screen.getByRole("link", { name: "Orbit, go to your spaces" })).toHaveAttribute(
      "href",
      "/spaces",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("has Spaces and then Assistants in the navigation, and no Settings", () => {
    renderPlain(<AppHeader me={me} current={null} />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Spaces", "Assistants"]);
    expect(links[0]).toHaveAttribute("href", "/spaces");
    expect(links[1]).toHaveAttribute("href", "/assistants");
    expect(within(nav).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("has no link that reads Settings other than the avatar's accessible name", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    const settingsLinks = screen.getAllByRole("link", { name: "Settings" });
    expect(settingsLinks).toHaveLength(1);
    expect(within(settingsLinks[0]).queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings", { selector: "a, a *" })).not.toBeInTheDocument();
  });

  it("marks Spaces as the current page on the spaces pages, and nothing else", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    expect(screen.getByRole("link", { name: "Spaces" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Assistants" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("marks Assistants as the current page on its own page, and nothing else", () => {
    renderPlain(<AppHeader me={me} current="assistants" />);

    const assistants = screen.getByRole("link", { name: "Assistants" });
    expect(assistants).toHaveAttribute("aria-current", "page");
    expect(assistants).toHaveClass("bg-accent", "text-foreground");
    expect(screen.getByRole("link", { name: "Spaces" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("shows neither tab as selected on the settings page", () => {
    renderPlain(<AppHeader me={me} current="settings" />);

    expect(screen.getByRole("link", { name: "Spaces" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Assistants" })).not.toHaveAttribute("aria-current");
  });

  it("shows the avatar as selected on the settings page, and not Spaces", () => {
    renderPlain(<AppHeader me={me} current="settings" />);

    const avatar = screen.getByRole("link", { name: "Settings" });
    expect(avatar).toHaveAttribute("aria-current", "page");
    expect(avatar).toHaveClass("ring-2", "ring-primary");
    expect(screen.getByRole("link", { name: "Spaces" })).not.toHaveAttribute("aria-current");
  });

  it("does not show the selected ring anywhere else", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveClass("ring-2");
  });

  it("still tells assistive technology who is signed in", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    const avatar = screen.getByRole("link", { name: "Settings" });
    expect(avatar).toHaveAccessibleDescription("Signed in as Alex Smith");
    expect(within(avatar).getByText("AS")).toBeInTheDocument();
  });

  it("takes the avatar link's name from the picture inside it, so two-letter initials never clash with a label", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    const avatar = screen.getByRole("link", { name: "Settings" });
    expect(avatar).not.toHaveAttribute("aria-label");
    expect(within(avatar).getByRole("img", { name: "Settings" })).toHaveTextContent("AS");
    expect(within(avatar).queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  describe("the avatar photo", () => {
    const PHOTO = "/api/users/user-alex/avatar?v=4";

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows the person's photo in the avatar link once it has loaded", async () => {
      stubImage({ width: 256, height: 256 });
      renderPlain(<AppHeader me={{ ...me, avatar_url: PHOTO }} current="spaces" />);

      const avatar = screen.getByRole("link", { name: "Settings" });
      await waitFor(() => expect(avatar.querySelector("img")).toHaveAttribute("src", PHOTO));
      expect(avatar.querySelector("img")).toHaveAttribute("alt", "");
    });

    it("keeps the link's name and the signed-in description with a photo", async () => {
      stubImage({ width: 256, height: 256 });
      renderPlain(<AppHeader me={{ ...me, avatar_url: PHOTO }} current="spaces" />);

      const avatar = screen.getByRole("link", { name: "Settings" });
      await waitFor(() => expect(avatar.querySelector("img")).not.toBeNull());
      expect(avatar).toHaveAccessibleDescription("Signed in as Alex Smith");
    });

    it("shows the initials when there is no photo", () => {
      renderPlain(<AppHeader me={{ ...me, avatar_url: null }} current="spaces" />);

      expect(
        within(screen.getByRole("link", { name: "Settings" })).getByText("AS"),
      ).toBeInTheDocument();
    });
  });

  it("names the avatar with a tooltip when it is hovered", async () => {
    const { user } = renderPlain(<AppHeader me={me} current="spaces" />);

    await user.hover(screen.getByRole("link", { name: "Settings" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Settings");
  });

  it("is a banner landmark", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("puts search and the theme within reach of every page", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    expect(screen.getByRole("button", { name: "Search or jump to…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });

  it("can be reached by keyboard in a sensible order", async () => {
    const { user } = renderPlain(<AppHeader me={me} current="spaces" />);

    await user.tab();
    expect(screen.getByRole("link", { name: "Orbit, go to your spaces" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Spaces" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Assistants" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Search or jump to…" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Theme" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
  });

  it("shows the Settings tooltip when the avatar is reached by keyboard", async () => {
    const { user } = renderPlain(<AppHeader me={me} current="spaces" />);

    for (let presses = 0; presses < 6; presses += 1) {
      await user.tab();
    }

    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Settings");
  });

  it("makes the logo link exactly as tall as the logo, so the logo sits centred and never drops", () => {
    renderPlain(<AppHeader me={me} current="spaces" />);

    expect(screen.getByRole("link", { name: "Orbit, go to your spaces" })).toHaveClass(
      ...LOGO_LINK_CLASS.split(" "),
    );
    expect(LOGO_LINK_CLASS.split(" ")).toContain("flex");
  });

  it("keeps the same width on every page, so the logo and tabs never move between them", () => {
    const { container, rerender } = renderPlain(<AppHeader me={me} current="spaces" />);
    expect(container.querySelector("header > div")).toHaveClass("max-w-6xl");

    rerender(<AppHeader me={me} current="assistants" />);
    expect(container.querySelector("header > div")).toHaveClass("max-w-6xl");

    rerender(<AppHeader me={me} current="settings" />);
    expect(container.querySelector("header > div")).toHaveClass("max-w-6xl");
  });
});

describe("AppShell", () => {
  it("wraps content in a main landmark that the skip link can target", () => {
    renderPlain(
      <AppShell me={me} current="spaces">
        <p>Page body</p>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(within(main).getByText("Page body")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("is wide by default and can be narrow or a full gallery", () => {
    const { rerender } = renderPlain(
      <AppShell me={me} current="spaces">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole("main")).toHaveClass("max-w-5xl");

    rerender(
      <AppShell me={me} current="settings" width="narrow">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole("main")).toHaveClass("max-w-2xl");

    rerender(
      <AppShell me={me} current="spaces" width="gallery">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl");
  });

  it("gives each page it shows a fresh data cache", () => {
    const appCache: Cache = new Map();
    const seen: unknown[] = [];
    function CacheProbe() {
      seen.push(useSWRConfig().cache);
      return null;
    }
    function page() {
      return (
        <SWRConfig value={{ provider: () => appCache }}>
          <AppShell me={me} current="spaces">
            <CacheProbe />
          </AppShell>
        </SWRConfig>
      );
    }

    const first = render(page());
    first.unmount();
    render(page());

    expect(seen[0]).not.toBe(appCache);
    expect(seen.at(-1)).not.toBe(appCache);
    expect(seen.at(-1)).not.toBe(seen[0]);
  });
});

describe("SkipLink", () => {
  it("points at the main content and appears on focus", async () => {
    const { user } = renderPlain(<SkipLink />);

    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link).toHaveAttribute("href", "#main");
    expect(link).toHaveClass("sr-only", "focus:not-sr-only");
    await user.tab();
    expect(link).toHaveFocus();
  });
});
