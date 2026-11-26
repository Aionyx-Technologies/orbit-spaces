import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("Card", () => {
  it("renders its parts with a heading and description", () => {
    renderPlain(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Shared memory</CardTitle>
          <CardDescription>Facts everyone can see.</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Shared memory" })).toBeInTheDocument();
    expect(screen.getByText("Facts everyone can see.")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(screen.getByTestId("card")).toHaveClass("rounded-lg", "bg-card");
  });

  it("merges custom classes", () => {
    renderPlain(<Card data-testid="card" className="p-0" />);
    expect(screen.getByTestId("card")).toHaveClass("p-0");
  });
});
