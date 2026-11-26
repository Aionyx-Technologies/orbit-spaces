import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpaceCard } from "@/components/spaces/space-card";
import { BLAKE, makeQuietSpace, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

function card(name = "Goa trip") {
  return screen.getByRole("article", { name });
}

describe("SpaceCard", () => {
  it("is one article named after the space, with a single link into it", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    const links = within(card()).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Goa trip");
    expect(links[0]).toHaveAttribute("href", "/spaces/space-1");
  });

  it("shows the facts that matter as highlights on the cover", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    const highlights = within(card()).getByRole("list", { name: "Highlights" });
    const items = within(highlights).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Dates");
    expect(items[0]).toHaveTextContent("Dec 20 to 23");
    expect(items[1]).toHaveTextContent("$3,000");
  });

  it("shows at most two highlights so none is cut off at the edge of the cover", () => {
    renderPlain(
      <SpaceCard
        space={makeSpaceSummary({
          highlights: [
            { key: "Dates", value: "Dec 20 to 23" },
            { key: "Budget", value: "$3,000" },
            { key: "Hotel", value: "Seaside Inn" },
          ],
        })}
      />,
    );

    const items = within(within(card()).getByRole("list", { name: "Highlights" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("Budget");
  });

  it("falls back to the latest item, then to an honest empty note", () => {
    const { unmount } = renderPlain(<SpaceCard space={makeSpaceSummary({ highlights: [] })} />);
    const latest = within(card()).getByRole("list", { name: "Highlights" });
    expect(latest).toHaveTextContent("Latest");
    expect(latest).toHaveTextContent("Hotel shortlist");
    unmount();

    renderPlain(<SpaceCard space={makeQuietSpace()} />);
    expect(within(card()).getByRole("list", { name: "Highlights" })).toHaveTextContent(
      "Nothing shared yet",
    );
  });

  it("says who added what last, crediting the assistant", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    expect(card()).toHaveTextContent("Grok added “Hotel shortlist”");
    expect(within(card()).getByText("Grok", { selector: "span" })).toHaveClass("font-medium");
  });

  it("does not claim nothing was shared when there are facts but no notes", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary({ latest: null, fact_count: 2 })} />);

    expect(card()).toHaveTextContent(/No notes yet\s*·\s*created/);
    expect(card()).not.toHaveTextContent("Nothing shared yet");
  });

  it("explains a quiet space instead of leaving a gap", () => {
    renderPlain(<SpaceCard space={makeQuietSpace()} />);
    expect(card()).toHaveTextContent(/Nothing shared yet\s*·\s*created/);
  });

  it("marks what you own and what was shared with you", () => {
    const { unmount } = renderPlain(<SpaceCard space={makeSpaceSummary({ is_creator: true })} />);
    expect(card()).toHaveTextContent("Yours");
    unmount();

    const shared = renderPlain(
      <SpaceCard space={makeSpaceSummary({ is_creator: false, owner_name: "Blake" })} />,
    );
    expect(card()).toHaveTextContent("Shared by Blake");
    shared.unmount();

    renderPlain(<SpaceCard space={makeSpaceSummary({ is_creator: false, owner_name: null })} />);
    expect(card()).toHaveTextContent("Shared by someone");
  });

  it("only shows the plan badge when there is a plan", () => {
    const { unmount } = renderPlain(<SpaceCard space={makeSpaceSummary({ has_plan: true })} />);
    expect(within(card()).getByText("Plan")).toBeInTheDocument();
    unmount();

    renderPlain(<SpaceCard space={makeSpaceSummary({ has_plan: false })} />);
    expect(within(card()).queryByText("Plan")).not.toBeInTheDocument();
  });

  it("says who is in it", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    expect(within(card()).getByRole("img", { name: "Alex, Blake" })).toBeInTheDocument();
    expect(card()).toHaveTextContent("2 people");
  });

  it("shows who someone is when the pointer rests on their avatar", async () => {
    const { user } = renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    await user.hover(within(card()).getByText("A"));

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText(/Joined/)).toBeInTheDocument();
  });

  it("keeps the avatars above the link that covers the card so they can be hovered", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);
    expect(within(card()).getByRole("img", { name: "Alex, Blake" })).toHaveClass(
      "relative",
      "z-10",
    );
  });

  it("uses the singular for one person", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary({ members: [BLAKE] })} />);
    expect(card()).toHaveTextContent("1 person");
  });

  it("names the assistants that have been used for assistive technology", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);
    expect(within(card()).getByText("Used with ChatGPT, Grok")).toHaveClass("sr-only");
  });

  it("draws a decorative cover that assistive technology skips", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} />);
    expect(card().querySelector('[data-slot="space-cover"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("staggers its entrance by its position in the list", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary()} index={3} />);
    expect(card().style.getPropertyValue("--i")).toBe("3");
  });

  it("can be reached and opened by keyboard", async () => {
    const { user } = renderPlain(<SpaceCard space={makeSpaceSummary()} />);

    await user.tab();

    expect(screen.getByRole("link", { name: "Goa trip" })).toHaveFocus();
  });
});
