import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXAMPLES, ExampleSpaces } from "@/components/landing/example-spaces";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("ExampleSpaces", () => {
  it("offers seven example spaces in dialog order, with Trip shown first", () => {
    renderPlain(<ExampleSpaces />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual([
      "✈️Trip",
      "🎁Holiday gifts",
      "🏠Household",
      "🍽️Dinner party",
      "🎉Event",
      "💼Client project",
      "👥Team project",
    ]);
    expect(screen.getByRole("tab", { name: "Trip" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Lisbon long weekend");
  });

  it("switches the preview when a chip is clicked", async () => {
    const { user } = renderPlain(<ExampleSpaces />);

    await user.click(screen.getByRole("tab", { name: "Holiday gifts" }));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Family Christmas");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Holiday gifts");
  });

  it("moves between chips with the arrow keys across both rows", async () => {
    const { user } = renderPlain(<ExampleSpaces />);

    await user.click(screen.getByRole("tab", { name: "Event" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Client project" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Café rebrand");

    await user.keyboard("{End}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Trip" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Team project" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Trip" })).toHaveFocus();
  });

  it("keeps only the selected chip in the tab order", () => {
    renderPlain(<ExampleSpaces />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it.each(EXAMPLES.map((example) => [example.chip, example] as const))(
    "%s: Orbit's line only uses names and numbers someone shared",
    (_chip, example) => {
      const shared = example.shares.map((share) => `${share.title} ${share.person}`).join(" ");
      const words = example.orbit.text.split(/\s+/).slice(1);
      const names = words
        .filter((word) => /^[A-Z]/.test(word))
        .map((word) => word.replace(/('s)?[^\w]*$/, ""));
      const numbers = example.orbit.text.match(/\d+/g) ?? [];
      for (const token of [...names, ...numbers]) {
        expect(shared, `"${token}" in "${example.orbit.text}"`).toContain(token);
      }
    },
  );

  it.each(EXAMPLES.map((example) => [example.chip, example] as const))(
    "%s names each member once",
    (_chip, example) => {
      const people = example.shares.map((share) => share.person);
      expect(new Set(people).size).toBe(people.length);
    },
  );

  it.each(EXAMPLES.map((example) => [example.chip] as const))(
    "%s says Orbit wrote its line, not a member",
    async (chip) => {
      const { user } = renderPlain(<ExampleSpaces />);

      await user.click(screen.getByRole("tab", { name: chip }));

      expect(
        within(screen.getByRole("tabpanel")).getByText("Written by Orbit"),
      ).toBeInTheDocument();
    },
  );

  it.each(EXAMPLES.map((example) => [example.chip, example] as const))(
    "%s shows three shares, one from someone on the web, and labels Orbit's line",
    async (chip, example) => {
      const { user } = renderPlain(<ExampleSpaces />);

      await user.click(screen.getByRole("tab", { name: chip }));

      const panel = screen.getByRole("tabpanel");
      expect(panel).toHaveTextContent(example.space);
      expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
      expect(within(panel).getAllByText(/on the web ·/)).toHaveLength(1);
      expect(panel).not.toHaveTextContent(/via web/i);
      expect(panel).toHaveTextContent(
        example.orbit.kind === "settle" ? "To settle" : "Written by Orbit",
      );
    },
  );
});
