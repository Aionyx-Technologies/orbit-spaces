import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorNotice } from "@/components/common/error-notice";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("ErrorNotice", () => {
  it("announces the message as an alert", () => {
    renderPlain(<ErrorNotice message="Title cannot be empty." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Title cannot be empty.");
  });

  it.each([null, undefined, ""])("renders nothing for %j", (message) => {
    renderPlain(<ErrorNotice message={message} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("passes a class name through", () => {
    renderPlain(<ErrorNotice message="Oops" className="mb-3" />);
    expect(screen.getByRole("alert")).toHaveClass("mb-3");
  });
});

describe("EmptyState", () => {
  it("shows a title, explanation and action", () => {
    renderPlain(
      <EmptyState title="Nothing shared yet" action={<button type="button">Share</button>}>
        Say “share this to Orbit” in your assistant.
      </EmptyState>,
    );

    expect(screen.getByRole("heading", { name: "Nothing shared yet" })).toBeInTheDocument();
    expect(screen.getByText(/share this to Orbit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("shows an icon when given one", () => {
    renderPlain(<EmptyState title="Empty" icon={<svg data-testid="icon" />} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("is a second-level heading when it sits inside a page", () => {
    renderPlain(<EmptyState title="Nothing shared yet" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Nothing shared yet" }),
    ).toBeInTheDocument();
  });

  it("can be the main heading when it is the whole page", () => {
    renderPlain(<EmptyState title="We can't find that page" headingLevel={1} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "We can't find that page" }),
    ).toBeInTheDocument();
  });

  it("leaves out the optional parts", () => {
    const { container } = renderPlain(<EmptyState title="Just a title" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelectorAll("div")).toHaveLength(1);
  });
});
