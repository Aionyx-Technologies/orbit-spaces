import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperatorCard } from "@/components/legal/operator-card";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("OperatorCard", () => {
  it("shows who runs this Orbit, how to reach them and where the data is", () => {
    renderPlain(
      <OperatorCard
        details={{
          name: "Pat Example",
          contact: "pat@example.com",
          dataLocation: "Railway, US East",
        }}
      />,
    );

    expect(screen.getByText("Run by")).toBeInTheDocument();
    expect(screen.getByText("Pat Example")).toBeInTheDocument();
    expect(screen.getByText("Where your data is stored")).toBeInTheDocument();
    expect(screen.getByText("Railway, US East")).toBeInTheDocument();
  });

  it("makes an email address a link", () => {
    renderPlain(
      <OperatorCard details={{ name: null, contact: "pat@example.com", dataLocation: null }} />,
    );

    expect(screen.getByRole("link", { name: "pat@example.com" })).toHaveAttribute(
      "href",
      "mailto:pat@example.com",
    );
  });

  it("shows other ways of contact as plain text, never as a link", () => {
    renderPlain(
      <OperatorCard
        details={{
          name: null,
          contact: "javascript:alert(1) or ask at the front desk",
          dataLocation: null,
        }}
      />,
    );

    expect(screen.getByText("javascript:alert(1) or ask at the front desk")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("only lists the details that were given", () => {
    renderPlain(<OperatorCard details={{ name: "Pat", contact: null, dataLocation: null }} />);

    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
    expect(screen.queryByText("Where your data is stored")).not.toBeInTheDocument();
  });

  it("tells people to ask before sharing when nothing was filled in", () => {
    renderPlain(<OperatorCard details={{ name: null, contact: null, dataLocation: null }} />);

    expect(screen.getByText(/has not added their details yet/)).toBeInTheDocument();
    expect(screen.getByText(/before you share anything/)).toBeInTheDocument();
  });
});
