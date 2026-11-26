import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UsageMeters } from "@/components/billing/usage-meters";
import type { AiUses } from "@/lib/api.types";
import { renderPlain } from "@/tests/unit/helpers/render";

const AI: AiUses = { limit: 150, used: 38, remaining: 112, resets_at: "2026-12-26T00:00:00Z" };
const UNLIMITED: AiUses = {
  limit: null,
  used: 0,
  remaining: null,
  resets_at: "2026-12-26T00:00:00Z",
};

describe("UsageMeters", () => {
  it("shows AI uses left and the reset date", () => {
    renderPlain(<UsageMeters aiUses={AI} instantEmails={null} />);

    expect(screen.getByText("112 of 150 AI uses left")).toBeInTheDocument();
    expect(screen.getByText("Resets Dec 26, 2026")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "AI uses used" });
    expect(bar).toHaveAttribute("aria-valuenow", "38");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "150");
  });

  it("explains what an AI use and an instant email are for", () => {
    renderPlain(<UsageMeters aiUses={AI} instantEmails={{ limit: 20, used: 3, remaining: 17 }} />);

    expect(
      screen.getByText("One AI use is one Combine, or one space set up from a sentence."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Instant emails tell you when someone adds to a space. Past the limit, updates wait for the morning summary.",
      ),
    ).toBeInTheDocument();
  });

  it("shows instant emails used today", () => {
    renderPlain(
      <UsageMeters aiUses={UNLIMITED} instantEmails={{ limit: 25, used: 3, remaining: 22 }} />,
    );

    expect(screen.getByText("3 of 25 instant emails used today")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Instant emails used today" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });

  it("hides AI uses when the limit is off", () => {
    renderPlain(<UsageMeters aiUses={UNLIMITED} instantEmails={null} />);

    expect(screen.queryByText(/AI uses left/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("hides emails when there is no daily cap", () => {
    renderPlain(<UsageMeters aiUses={AI} instantEmails={null} />);

    expect(screen.queryByText(/instant emails/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("shows pack credits only above zero", () => {
    renderPlain(
      <UsageMeters aiUses={AI} instantEmails={null} aiPackCredits={40} emailPackCredits={0} />,
    );

    expect(screen.getByText("AI pack uses: 40")).toBeInTheDocument();
    expect(screen.queryByText(/Email credits/)).not.toBeInTheDocument();
  });
});
