import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LegalPage } from "@/components/legal/legal-page";
import { LegalSection } from "@/components/legal/legal-section";
import { PolicyLinks } from "@/components/legal/policy-links";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("LegalPage", () => {
  it("has a title, the date it changed and the main landmark", () => {
    renderPlain(
      <LegalPage title="Privacy" updated="19 November 2026">
        <p>Body</p>
      </LegalPage>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Last updated 19 November 2026")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("goes back to the home page from the logo", () => {
    renderPlain(
      <LegalPage title="Terms" updated="19 November 2026">
        <p>Body</p>
      </LegalPage>,
    );

    expect(screen.getByRole("link", { name: "Orbit home" })).toHaveAttribute("href", "/");
  });

  it("links to every policy at the bottom", () => {
    renderPlain(
      <LegalPage title="Terms" updated="19 November 2026">
        <p>Body</p>
      </LegalPage>,
    );

    const policies = within(screen.getByRole("navigation", { name: "Policies" }));
    expect(policies.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(policies.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(policies.getByRole("link", { name: "Data policy" })).toHaveAttribute(
      "href",
      "/data-policy",
    );
    expect(policies.getByRole("link", { name: "Disclaimer" })).toHaveAttribute(
      "href",
      "/disclaimer",
    );
  });

  it("says Orbit is a product of Aionyx Technologies at the bottom", () => {
    renderPlain(
      <LegalPage title="Terms" updated="19 November 2026">
        <p>Body</p>
      </LegalPage>,
    );

    expect(
      screen.getByText(/Orbit is a product of Aionyx Technologies, Inc\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hello@orbitspaces.ai" })).toHaveAttribute(
      "href",
      "mailto:hello@orbitspaces.ai",
    );
  });
});

describe("LegalSection", () => {
  it("puts its title in a heading above its content", () => {
    renderPlain(
      <LegalSection title="Cookies">
        <p>One cookie.</p>
      </LegalSection>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Cookies" })).toBeInTheDocument();
    expect(screen.getByText("One cookie.")).toBeInTheDocument();
  });
});

describe("PolicyLinks", () => {
  it("accepts extra classes for its place on the page", () => {
    renderPlain(<PolicyLinks className="mt-4" />);

    expect(screen.getByRole("navigation", { name: "Policies" })).toHaveClass("mt-4");
  });
});
