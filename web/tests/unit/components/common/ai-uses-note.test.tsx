import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiUsesNote } from "@/components/common/ai-uses-note";

const RESETS = "2026-12-03T09:00:00Z";

describe("AiUsesNote", () => {
  it("says how many AI uses are left this month", () => {
    render(<AiUsesNote uses={{ limit: 20, used: 5, remaining: 15, resets_at: RESETS }} />);

    expect(screen.getByRole("status")).toHaveTextContent("15 of 20 AI uses left this month");
  });

  it("says when the uses come back once they are gone", () => {
    render(<AiUsesNote uses={{ limit: 20, used: 20, remaining: 0, resets_at: RESETS }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No AI uses left this month. They reset on Dec 3. Plans with more AI uses are coming soon.",
    );
  });

  it("links to Settings when billing is on and the uses are gone", () => {
    render(
      <AiUsesNote uses={{ limit: 20, used: 20, remaining: 0, resets_at: RESETS }} billingEnabled />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No AI uses left this month. They reset on Dec 3. Buy more or upgrade in Settings.",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows nothing on a server that does not limit AI uses", () => {
    const { container } = render(
      <AiUsesNote uses={{ limit: null, used: 0, remaining: null, resets_at: RESETS }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
