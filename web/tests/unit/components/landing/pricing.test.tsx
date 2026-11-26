import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pricing } from "@/components/landing/pricing";
import { renderPlain } from "@/tests/unit/helpers/render";

function region() {
  return screen.getByRole("region", { name: "Simple pricing" });
}

function card(name: string, level = 3) {
  return within(region())
    .getByRole("heading", { level, name })
    .closest("li, [role=group]") as HTMLElement;
}

describe("Pricing", () => {
  it("leads with a plain headline and the rule about who pays", () => {
    renderPlain(<Pricing billingEnabled />);

    expect(screen.getByRole("heading", { level: 2, name: "Simple pricing" })).toBeInTheDocument();
    expect(screen.getByText(/Joining a space is always free/)).toBeInTheDocument();
    expect(screen.queryByText(/once paid plans arrive/)).not.toBeInTheDocument();
  });

  it("says paid plans are on the way while billing is off", () => {
    renderPlain(<Pricing billingEnabled={false} />);

    expect(screen.getByText(/once paid plans arrive/)).toBeInTheDocument();
  });

  it("shows Free, Plus and Team as the three plans, and Self-hosted apart from them", () => {
    renderPlain(<Pricing billingEnabled />);

    const plans = within(within(region()).getAllByRole("list")[0] as HTMLElement).getAllByRole(
      "heading",
      { level: 3 },
    );
    expect(plans.map((heading) => heading.textContent)).toEqual(["Free", "Plus", "Team"]);
    expect(within(card("Self-hosted")).getByText("Free, open source")).toBeInTheDocument();
  });

  it.each([
    ["Free", "$0", "per month", "No card needed"],
    ["Plus", "$6", "per month", "or $60 a year, 2 months free"],
    ["Team", "$10", "per member per month", "or $100 per member a year, 2 months free"],
  ])("shows the %s price as a big number with its cadence", (name, price, cadence, also) => {
    renderPlain(<Pricing billingEnabled />);

    const plan = card(name);
    expect(within(plan).getByText(price)).toBeInTheDocument();
    expect(within(plan).getByText(cadence)).toBeInTheDocument();
    expect(within(plan).getByText(also)).toBeInTheDocument();
  });

  it("gives Free a way in, with no card needed", () => {
    renderPlain(<Pricing billingEnabled={false} />);

    expect(within(card("Free")).getByRole("link", { name: "Start free" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=/spaces",
    );
    expect(within(card("Free")).queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("lets people get Plus, with the accent, when billing is on", () => {
    renderPlain(<Pricing billingEnabled />);

    const plus = card("Plus");
    expect(within(plus).getByRole("link", { name: "Get Plus" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=/settings",
    );
    expect(within(plus).getByText("Cancel any time.")).toBeInTheDocument();
    expect(within(plus).queryByText("Coming soon")).not.toBeInTheDocument();
    expect(plus).toHaveClass("border-primary");
  });

  it("marks Plus coming soon, with no link and no accent, while billing is off", () => {
    renderPlain(<Pricing billingEnabled={false} />);

    const plus = card("Plus");
    expect(within(plus).getByText("Coming soon")).toBeInTheDocument();
    expect(within(plus).queryByRole("link")).not.toBeInTheDocument();
    expect(plus).not.toHaveClass("border-primary");
  });

  it("keeps Team coming soon whether billing is on or off", () => {
    const { unmount } = renderPlain(<Pricing billingEnabled={false} />);
    expect(within(card("Team")).getByText("Coming soon")).toBeInTheDocument();
    unmount();

    renderPlain(<Pricing billingEnabled />);
    expect(within(card("Team")).getByText("Coming soon")).toBeInTheDocument();
    expect(within(card("Team")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("gives every plan exactly one call to action or one status", () => {
    renderPlain(<Pricing billingEnabled />);

    for (const name of ["Free", "Plus", "Team"]) {
      const plan = card(name);
      const actions = within(plan).queryAllByRole("link").length;
      const statuses = within(plan).queryAllByText("Coming soon").length;
      expect(actions + statuses, name).toBe(1);
    }
  });

  it("lists what each plan really gives", () => {
    renderPlain(<Pricing billingEnabled />);

    const free = card("Free");
    for (const text of [
      "5 spaces you own, join as many as you like",
      "Up to 10 people in each space",
      "20 AI uses a month",
      "20 instant update emails a day",
    ]) {
      expect(within(free).getByText(text)).toBeInTheDocument();
    }
    const plus = card("Plus");
    expect(within(plus).getByText("Everything in Free, plus:")).toBeInTheDocument();
    for (const text of [
      "Unlimited spaces",
      "Up to 25 people in each space",
      "150 AI uses a month",
      "100 instant update emails a day",
    ]) {
      expect(within(plus).getByText(text)).toBeInTheDocument();
    }
    expect(within(plus).queryByText(/Full history/)).not.toBeInTheDocument();
  });

  it("shows Self-hosted as a free option with no button and no link", () => {
    renderPlain(<Pricing billingEnabled />);

    const strip = card("Self-hosted");
    for (const text of [
      "Every collaboration feature",
      "Bring your own AI key",
      "You handle hosting, updates and backups",
    ]) {
      expect(within(strip).getByText(text)).toBeInTheDocument();
    }
    expect(within(strip).queryByRole("link")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("shows the add-ons with their price and what they mean, only when billing is on", () => {
    const { unmount } = renderPlain(<Pricing billingEnabled={false} />);
    expect(screen.queryByText("Extra AI")).not.toBeInTheDocument();
    expect(screen.queryByText("Extra emails")).not.toBeInTheDocument();
    unmount();

    renderPlain(<Pricing billingEnabled />);
    const ai = card("Extra AI", 4);
    expect(within(ai).getByText("100 AI uses")).toBeInTheDocument();
    expect(within(ai).getByText("$5")).toBeInTheDocument();
    expect(
      within(ai).getByText(
        /One AI use is one press of Combine, or one space set up from a sentence/,
      ),
    ).toBeInTheDocument();
    expect(within(ai).getByText(/last 12 months/)).toBeInTheDocument();
    const emails = card("Extra emails", 4);
    expect(within(emails).getByText("500 instant update emails")).toBeInTheDocument();
    expect(within(emails).getByText("$3")).toBeInTheDocument();
    expect(within(emails).getByText(/daily allowance/)).toBeInTheDocument();
    expect(within(emails).getByText(/last 12 months/)).toBeInTheDocument();
    expect(
      screen.getByText(/Buy add-ons from Settings once you are signed in/),
    ).toBeInTheDocument();
  });

  it("lists the daily instant update emails on Team too, so it does not look like it has none", () => {
    renderPlain(<Pricing billingEnabled />);

    expect(
      within(card("Team")).getByText("250 instant update emails a day per member"),
    ).toBeInTheDocument();
  });

  it("says how self-hosted handles email", () => {
    renderPlain(<Pricing billingEnabled />);

    expect(
      within(card("Self-hosted")).getByText("Bring your own email provider"),
    ).toBeInTheDocument();
  });

  it.each([true, false])(
    "says right under the plans what happens past the daily email limit (billing %s)",
    (billingEnabled) => {
      renderPlain(<Pricing billingEnabled={billingEnabled} />);

      const note = screen.getByText(
        "Past the daily limit, update emails wait for the morning summary.",
      );
      const plans = within(region()).getAllByRole("list")[0] as HTMLElement;
      const selfHosted = card("Self-hosted");
      expect(plans.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        note.compareDocumentPosition(selfHosted) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );
});
