import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoSignIn } from "@/components/landing/demo-sign-in";
import { renderPlain } from "@/tests/unit/helpers/render";

const PEOPLE = [
  { key: "alex", name: "Alex" },
  { key: "blake", name: "Blake" },
];

describe("DemoSignIn", () => {
  it("says that demo mode is on and what it does", () => {
    renderPlain(<DemoSignIn people={PEOPLE} />);

    const region = screen.getByRole("region", { name: "Try the demo" });
    expect(within(region).getByText(/Demo mode is on for this server/)).toBeInTheDocument();
    expect(within(region).getByText(/Skip the email/)).toBeInTheDocument();
  });

  it("has one button per person that signs in as them", () => {
    renderPlain(<DemoSignIn people={PEOPLE} />);

    for (const person of PEOPLE) {
      const button = screen.getByRole("button", { name: `Continue as ${person.name}` });
      const form = button.closest("form");
      expect(form).toHaveAttribute("method", "post");
      expect(form).toHaveAttribute("action", "/auth/demo");
      expect(form?.querySelector('input[name="person"]')).toHaveValue(person.key);
    }
  });

  it("shows nothing to click when there is nobody to sign in as", () => {
    renderPlain(<DemoSignIn people={[]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
