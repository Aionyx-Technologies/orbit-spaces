import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("Input", () => {
  it("accepts typing", async () => {
    const { user } = renderPlain(<Input aria-label="Name" />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Alex");

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Alex");
  });

  it("is not usable when disabled", () => {
    renderPlain(<Input aria-label="Name" disabled />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  });

  it("marks invalid input for assistive tech", () => {
    renderPlain(<Input aria-label="Name" aria-invalid />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInvalid();
  });

  it("passes the type through", () => {
    renderPlain(<Input aria-label="Email" type="email" />);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("type", "email");
  });
});

describe("Textarea", () => {
  it("accepts multi-line typing", async () => {
    const { user } = renderPlain(<Textarea aria-label="Notes" />);

    await user.type(screen.getByRole("textbox", { name: "Notes" }), "one{Enter}two");

    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("one\ntwo");
  });

  it("can be disabled and flagged invalid", () => {
    renderPlain(<Textarea aria-label="Notes" disabled aria-invalid />);
    const field = screen.getByRole("textbox", { name: "Notes" });
    expect(field).toBeDisabled();
    expect(field).toBeInvalid();
  });
});

describe("Label", () => {
  it("names a field and focuses it when clicked", async () => {
    const { user } = renderPlain(
      <>
        <Label htmlFor="field">Display name</Label>
        <Input id="field" />
      </>,
    );

    expect(screen.getByLabelText("Display name")).toBe(screen.getByRole("textbox"));
    await user.click(screen.getByText("Display name"));

    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});

describe("Select", () => {
  it("is a real select, named by its label, that can be changed from the keyboard", async () => {
    const { user } = renderPlain(
      <>
        <Label htmlFor="zone">Time zone</Label>
        <Select id="zone" defaultValue="a">
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </Select>
      </>,
    );

    const select = screen.getByRole("combobox", { name: "Time zone" });
    await user.selectOptions(select, "b");

    expect(select).toHaveValue("b");
    expect(select).toHaveAttribute("data-slot", "select");
  });

  it("hides its arrow from assistive technology and lets clicks through to the select", () => {
    const { container } = renderPlain(
      <Select aria-label="Zone">
        <option>One</option>
      </Select>,
    );

    const arrow = container.querySelector("svg");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(arrow).toHaveClass("pointer-events-none");
  });

  it("can be disabled and flagged invalid", () => {
    renderPlain(
      <Select aria-label="Zone" disabled aria-invalid>
        <option>One</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Zone" });
    expect(select).toBeDisabled();
    expect(select).toBeInvalid();
  });
});

describe("RadioGroup", () => {
  function setupGroup(onValueChange = vi.fn()) {
    const view = renderPlain(
      <RadioGroup aria-label="How often" defaultValue="one" onValueChange={onValueChange}>
        <Label htmlFor="r-one">One</Label>
        <RadioGroupItem id="r-one" value="one" />
        <Label htmlFor="r-two">Two</Label>
        <RadioGroupItem id="r-two" value="two" />
      </RadioGroup>,
    );
    return { ...view, onValueChange };
  }

  it("shows one choice selected and names each by its label", () => {
    setupGroup();

    expect(screen.getByRole("radiogroup", { name: "How often" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "One" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Two" })).not.toBeChecked();
  });

  it("changes the choice when a radio or its label is clicked", async () => {
    const { user, onValueChange } = setupGroup();

    await user.click(screen.getByText("Two"));

    expect(screen.getByRole("radio", { name: "Two" })).toBeChecked();
    expect(onValueChange).toHaveBeenCalledWith("two");
  });
});
