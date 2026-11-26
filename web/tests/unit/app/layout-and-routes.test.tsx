import { screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import AssistantsLoading from "@/app/(app)/assistants/loading";
import SettingsLoading from "@/app/(app)/settings/loading";
import SpaceLoading from "@/app/(app)/spaces/[id]/loading";
import SpaceNotFound from "@/app/(app)/spaces/[id]/not-found";
import SpacesLoading from "@/app/(app)/spaces/loading";
import ErrorPage from "@/app/error";
import InviteLoading from "@/app/invite/[token]/loading";
import RootLayout, { generateMetadata, viewport } from "@/app/layout";
import NotFound from "@/app/not-found";
import { renderPlain } from "@/tests/unit/helpers/render";

const cookieJar = vi.hoisted(() => ({ theme: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "host" ? "orbit.example.com" : null),
  }),
  cookies: async () => ({
    get: (name: string) =>
      name === "orbit-theme" && cookieJar.theme !== undefined
        ? { name, value: cookieJar.theme }
        : undefined,
  }),
}));
vi.mock("@/app/fonts", () => ({
  sansFont: { variable: "font-sans-test" },
}));

async function renderLayout() {
  return renderToStaticMarkup(await RootLayout({ children: <main id="main">Page body</main> }));
}

describe("root layout", () => {
  it("has a sensible title, keeps the app out of search engines and supports light and dark", async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toEqual({
      default: "Orbit · Work together across AI assistants",
      template: "%s · Orbit",
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(viewport.colorScheme).toBe("light dark");
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#f9fafd" },
      { media: "(prefers-color-scheme: dark)", color: "#0a0c13" },
    ]);
  });

  it("gives shared links a title, description and large preview on the public address", async () => {
    const metadata = await generateMetadata();

    expect(String(metadata.metadataBase)).toBe("https://orbit.example.com/");
    expect(metadata.applicationName).toBe("Orbit");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: "Orbit",
      title: "Orbit · Work together across AI assistants",
      url: "/",
    });
    expect(metadata.openGraph?.description).toContain("whichever assistant they use");
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Orbit · Work together across AI assistants",
    });
  });

  it("is an English page with a skip link before the content", async () => {
    const html = await renderLayout();

    expect(html).toContain('lang="en"');
    expect(html.indexOf('href="#main"')).toBeGreaterThan(-1);
    expect(html.indexOf('href="#main"')).toBeLessThan(html.indexOf("Page body"));
    expect(html).toContain("Skip to content");
  });

  it("loads the one interface font on the page and no second display font", async () => {
    const html = await renderLayout();

    expect(html).toContain("font-sans-test");
    expect(html).not.toContain("font-display");
  });

  it.each([
    ["light", true],
    ["dark", true],
    ["system", false],
    ["neon", false],
    [undefined, false],
  ])(
    "renders the %s theme choice from the cookie before the page paints",
    async (cookie, forced) => {
      cookieJar.theme = cookie;

      const html = await renderLayout();

      expect(html.includes("data-theme")).toBe(forced);
      if (forced) {
        expect(html).toContain(`data-theme="${cookie}"`);
      }
      cookieJar.theme = undefined;
    },
  );
});

describe("error page", () => {
  it("says what happened without alarming anyone, and offers to try again", async () => {
    const reset = vi.fn();
    const problem = Object.assign(new Error("boom"), { digest: "abc" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = renderPlain(<ErrorPage error={problem} reset={reset} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your data is safe/)).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(log).toHaveBeenCalledWith(problem);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("not found pages", () => {
  it("offers a way home from an unknown address", () => {
    renderPlain(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "We can't find that page" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Orbit" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("shows the space not available page for a space that cannot be opened", () => {
    renderPlain(<SpaceNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "This space isn't available" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your spaces" })).toHaveAttribute(
      "href",
      "/spaces",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });
});

describe("loading pages", () => {
  it.each([
    ["spaces", SpacesLoading, "max-w-6xl"],
    ["a space", SpaceLoading, "max-w-6xl"],
    ["settings", SettingsLoading, "max-w-2xl"],
    ["assistants", AssistantsLoading, "max-w-2xl"],
  ])("shows the page frame and a placeholder while %s load", (_name, Loading, width) => {
    const { container } = renderPlain(<Loading />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass(width);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3);
  });

  it.each([
    ["spaces", SpacesLoading, "Spaces"],
    ["a space", SpaceLoading, "Spaces"],
    ["settings", SettingsLoading, null],
    ["assistants", AssistantsLoading, "Assistants"],
  ])("keeps the tabs in view and lights the right one while %s load", (_name, Loading, lit) => {
    const { container } = renderPlain(<Loading />);
    const tabs = Array.from(container.querySelectorAll("header [aria-hidden='true'] > span"));
    const highlighted = tabs.filter((tab) => tab.classList.contains("bg-accent"));

    expect(tabs.map((tab) => tab.textContent)).toEqual(["Spaces", "Assistants"]);
    expect(highlighted.map((tab) => tab.textContent)).toEqual(lit ? [lit] : []);
  });

  it("shows a placeholder for an invite while it loads", () => {
    renderPlain(<InviteLoading />);

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});
