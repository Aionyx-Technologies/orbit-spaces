import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "@/components/landing/landing";
import { renderPlain } from "@/tests/unit/helpers/render";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);

describe("Landing", () => {
  it("explains Orbit in one sentence under a clear heading", () => {
    renderPlain(<Landing />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Work together across AI assistants" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Invite anyone into a space, whichever assistant they use, or none at all\./,
      ),
    ).toBeInTheDocument();
  });

  it("has one obvious way in", () => {
    renderPlain(<Landing />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=/spaces",
    );
  });

  it("points from the hero to the explanation further down", () => {
    const { container } = renderPlain(<Landing />);

    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(container.querySelector("#how-it-works")).toBeInTheDocument();
  });

  it("walks through sharing, reading and combining with one worked example", () => {
    renderPlain(<Landing />);

    const section = screen.getByRole("region", {
      name: "Three friends, three assistants, one trip",
    });
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Say “share this to Orbit”",
      "Every assistant reads the same space",
      "Ask Orbit to pull it together",
    ]);
    expect(within(section).getAllByText("Shared to Vegas trip")).toHaveLength(3);
    expect(within(section).getByText("Written by Orbit")).toBeInTheDocument();
    expect(within(section).getByText("To settle")).toBeInTheDocument();
  });

  it("says what Orbit never does", () => {
    renderPlain(<Landing />);

    const promises = screen.getByRole("region", { name: "Orbit only knows what you hand it" });
    expect(within(promises).getAllByRole("listitem")).toHaveLength(3);
    expect(promises).toHaveTextContent(/never reads your chats/);
  });

  it("ends with a second way in, and keeps the policies in the footer", () => {
    renderPlain(<Landing />);

    expect(screen.getByRole("link", { name: "Start a space" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=/spaces",
    );
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "Privacy" }),
    ).toBeInTheDocument();
  });

  it("lets a signed-out visitor pick a theme, following the system by default", async () => {
    const { user } = renderPlain(<Landing />);

    await user.click(screen.getByRole("button", { name: "Theme" }));

    expect(screen.getByRole("menuitemradio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeInTheDocument();
  });

  it("links to the policies", () => {
    renderPlain(<Landing />);

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Data policy" })).toHaveAttribute(
      "href",
      "/data-policy",
    );
  });

  it("names Aionyx Technologies in the footer, with the disclaimer", () => {
    renderPlain(<Landing />);

    const footer = within(screen.getByRole("contentinfo"));
    expect(
      footer.getByText(/Orbit is a product of Aionyx Technologies, Inc\./),
    ).toBeInTheDocument();
    expect(footer.getByRole("link", { name: "hello@orbitspaces.ai" })).toHaveAttribute(
      "href",
      "mailto:hello@orbitspaces.ai",
    );
    expect(footer.getByRole("link", { name: "Disclaimer" })).toHaveAttribute("href", "/disclaimer");
    expect(footer.getByText(/All rights reserved/)).toBeInTheDocument();
  });

  it("says it is open source and links to the code near the top", () => {
    renderPlain(<Landing />);

    expect(screen.getByText(/Open source under AGPL-3\.0\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the code on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Aionyx-Technologies/orbit-spaces",
    );
  });

  it("links to the source code from the footer", () => {
    renderPlain(<Landing />);

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Source code" })).toHaveAttribute(
      "href",
      "https://github.com/Aionyx-Technologies/orbit-spaces",
    );
  });

  it("does not mention the demo unless it is switched on", () => {
    renderPlain(<Landing />);
    expect(screen.queryByText("Try the demo")).not.toBeInTheDocument();

    renderPlain(<Landing demo={{ enabled: false, people: [] }} />);
    expect(screen.queryByText("Try the demo")).not.toBeInTheDocument();
  });

  it("offers each demo person when the demo is on", () => {
    renderPlain(
      <Landing
        demo={{
          enabled: true,
          people: [
            { key: "alex", name: "Alex" },
            { key: "blake", name: "Blake" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue as Alex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as Blake" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("leads the hero with a setup prompt that carries this server's address", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = renderPlain(<Landing mcpUrl="https://orbit.example.com/mcp" />);

    const hero = screen.getByRole("region", { name: "Work together across AI assistants" });
    expect(screen.getAllByRole("button", { name: /setup prompt/ })).toHaveLength(1);
    await user.click(within(hero).getByRole("button", { name: "Copy setup prompt" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(
      expect.stringContaining("https://orbit.example.com/mcp"),
    );
    expect(within(hero).getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "Setup guide" })).toHaveAttribute(
      "href",
      "/setup",
    );
  });

  it("leaves the setup prompt out when the address is unknown", () => {
    renderPlain(<Landing mcpUrl={null} />);

    expect(screen.queryByRole("button", { name: "Copy setup prompt" })).not.toBeInTheDocument();
  });

  it("is the main landmark", () => {
    renderPlain(<Landing />);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("names the assistants it works with as text for screen readers, not only in the artwork", () => {
    renderPlain(<Landing />);

    const list = screen.getByRole("list", { name: "Works with" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["ChatGPT", "Claude", "Grok", "Muse", "OpenClaw", "Hermes Agent", "Wabi"]);
  });

  it("draws an orbit behind the headline that assistive technology skips", () => {
    const { container } = renderPlain(<Landing />);

    const art = container.querySelector(".cover");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art?.querySelectorAll("ellipse")).toHaveLength(3);
    expect(art?.querySelectorAll(".satellite")).toHaveLength(9);
  });

  it("sends the assistants round the orbit as their real logos", () => {
    const { container } = renderPlain(<Landing />);

    const logos = Array.from(container.querySelectorAll(".cover .satellite[data-assistant]"));
    expect(logos.map((logo) => logo.getAttribute("data-assistant"))).toEqual([
      "chatgpt",
      "claude",
      "grok",
      "muse",
      "openclaw",
      "hermes",
      "wabi",
      "codex",
      "cursor",
    ]);
  });

  it("keeps every assistant on an outer ring, clear of the faded centre behind the headline", () => {
    const { container } = renderPlain(<Landing />);

    const logos = Array.from(
      container.querySelectorAll<HTMLElement>(".cover .satellite[data-assistant]"),
    );
    expect(logos).toHaveLength(9);
    for (const logo of logos) {
      expect(Number(logo.style.getPropertyValue("--rx"))).toBeGreaterThanOrEqual(340);
    }
  });

  it("keeps the moving parts of the artwork off small screens, where they would cross the text", () => {
    const { container } = renderPlain(<Landing />);

    for (const satellite of container.querySelectorAll(".satellite")) {
      expect(satellite).toHaveClass("max-sm:hidden");
    }
  });

  it("shows example spaces beyond a trip", () => {
    renderPlain(<Landing />);

    const section = screen.getByRole("region", { name: "What will you plan together?" });
    expect(within(section).getAllByRole("tab")).toHaveLength(7);
  });

  it("lists the new templates when explaining how to open a space", () => {
    renderPlain(<Landing />);

    const templates = screen.getByRole("list", { name: "Templates" });
    expect(templates).toHaveTextContent("Holiday gifts");
    expect(templates).not.toHaveTextContent("Friends trip");
  });

  it("closes by inviting people with or without an assistant", () => {
    renderPlain(<Landing />);

    expect(
      screen.getByText(/in the assistant you already use, or on the web\./),
    ).toBeInTheDocument();
  });

  it("avoids jargon", () => {
    renderPlain(<Landing />);
    expect(document.body.textContent).not.toMatch(/MCP|connector|OAuth/i);
  });

  it("keeps Plus coming soon when billing is off or not given", () => {
    renderPlain(<Landing />);
    const section = screen.getByRole("region", { name: "Simple pricing" });

    expect(within(section).getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Get Plus" })).not.toBeInTheDocument();
  });

  it("offers Plus when billing is on", () => {
    renderPlain(<Landing billingEnabled />);
    const section = screen.getByRole("region", { name: "Simple pricing" });

    expect(screen.getByRole("link", { name: "Get Plus" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=/settings",
    );
    expect(within(section).getAllByText("Coming soon")).toHaveLength(1);
  });
});
