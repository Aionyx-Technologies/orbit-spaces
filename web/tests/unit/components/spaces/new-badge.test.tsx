import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NewBadge } from "@/components/spaces/new-badge";
import { SpaceCard } from "@/components/spaces/space-card";
import { SpaceRow } from "@/components/spaces/space-row";
import { makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("NewBadge", () => {
  it("shows how many things are new", () => {
    renderPlain(<NewBadge count={3} />);

    expect(screen.getByText("3 new")).toBeInTheDocument();
    expect(screen.getByText("3 new since you last looked")).toHaveClass("sr-only");
  });

  it.each([0, -1])("shows nothing when the count is %s", (count) => {
    const { container } = renderPlain(<NewBadge count={count} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("caps a very large count so the badge stays small", () => {
    renderPlain(<NewBadge count={250} />);

    expect(screen.getByText("99+ new")).toBeInTheDocument();
  });

  it("keeps a count of 99 as it is", () => {
    renderPlain(<NewBadge count={99} />);

    expect(screen.getByText("99 new")).toBeInTheDocument();
  });

  it("takes extra classes from its parent", () => {
    renderPlain(<NewBadge count={1} className="ml-2" />);

    expect(document.querySelector("[data-slot='new-badge']")).toHaveClass("ml-2");
  });
});

describe("new badge on spaces", () => {
  it("appears on a card with new things and is named for people using a screen reader", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary({ new_count: 2 })} />);

    expect(screen.getByText("2 new since you last looked")).toBeInTheDocument();
  });

  it("is absent from a card with nothing new", () => {
    renderPlain(<SpaceCard space={makeSpaceSummary({ new_count: 0 })} />);

    expect(document.querySelector("[data-slot='new-badge']")).toBeNull();
  });

  it("appears on a row with new things", () => {
    renderPlain(<SpaceRow space={makeSpaceSummary({ new_count: 5 })} />);

    expect(screen.getByText("5 new since you last looked")).toBeInTheDocument();
  });

  it("is absent from a row with nothing new", () => {
    renderPlain(<SpaceRow space={makeSpaceSummary({ new_count: 0 })} />);

    expect(document.querySelector("[data-slot='new-badge']")).toBeNull();
  });
});
