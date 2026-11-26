import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { YourDataSection } from "@/components/settings/your-data-section";

describe("YourDataSection", () => {
  it("is a named region that says what the download holds", () => {
    render(<YourDataSection />);

    const region = screen.getByRole("region", { name: "Your data" });
    expect(region).toHaveTextContent("your account");
    expect(region).toHaveTextContent("never includes sign-in links, access keys");
  });

  it("offers one link that downloads the file from the account export route", () => {
    render(<YourDataSection />);

    const region = screen.getByRole("region", { name: "Your data" });
    const link = within(region).getByRole("link", { name: "Download my data" });
    expect(link).toHaveAttribute("href", "/api/me/export");
    expect(link).toHaveAttribute("download");
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
  });
});
