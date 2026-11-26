import { screen, within } from "@testing-library/react";
import { useState, type SubmitEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { TemplateForm } from "@/components/templates/template-form";
import {
  TEMPLATE_COMBINE_HINT_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_FACT_HINT_MAX,
  TEMPLATE_FACTS_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SECTION_MAX,
  TEMPLATE_TIP_MAX,
  TEMPLATE_TIPS_MAX,
} from "@/lib/constants";
import { toFormValue } from "@/lib/template-form";
import type { TemplateFormValue } from "@/lib/template-form.types";
import { FAMILY_VACATION, makeTemplate } from "@/tests/unit/helpers/fixtures";
import { renderWithProviders } from "@/tests/unit/helpers/render";

function Harness({
  initial,
  onValue,
}: Readonly<{ initial: TemplateFormValue; onValue?: (value: TemplateFormValue) => void }>) {
  const [value, setValue] = useState(initial);
  return (
    <TemplateForm
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function setup(initial: TemplateFormValue = toFormValue(FAMILY_VACATION)) {
  const onValue = vi.fn();
  return { onValue, ...renderWithProviders(<Harness initial={initial} onValue={onValue} />) };
}

function lastValue(onValue: ReturnType<typeof vi.fn>): TemplateFormValue {
  return onValue.mock.calls.at(-1)?.[0] as TemplateFormValue;
}

function sectionBox() {
  return screen.getByRole("group", { name: "Plan sections" });
}

describe("TemplateForm", () => {
  it("fills every field from the template", () => {
    setup();

    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Trip");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Plan a trip together",
    );
    expect(screen.getByRole("textbox", { name: "Fact 1 name" })).toHaveValue("Dates");
    expect(screen.getByRole("textbox", { name: "Fact 1 hint" })).toHaveValue(
      "When you are travelling",
    );
    expect(screen.getByRole("textbox", { name: "How to combine" })).toHaveValue(
      "Balance everyone's preferences and stay within the budget.",
    );
    expect(screen.getByRole("textbox", { name: "Tip 1" })).toHaveValue("Share a hotel shortlist");
  });

  it("limits each field to what the server accepts", () => {
    setup();

    const limits: [string, number][] = [
      ["Template name", TEMPLATE_NAME_MAX],
      ["Description", TEMPLATE_DESCRIPTION_MAX],
      ["Fact 1 hint", TEMPLATE_FACT_HINT_MAX],
      ["Fact 1 name", 100],
      ["Section 1", TEMPLATE_SECTION_MAX],
      ["How to combine", TEMPLATE_COMBINE_HINT_MAX],
      ["Tip 1", TEMPLATE_TIP_MAX],
    ];
    for (const [label, limit] of limits) {
      expect(screen.getByRole("textbox", { name: label })).toHaveAttribute(
        "maxlength",
        String(limit),
      );
    }
  });

  it("shows To settle as a fixed last row with no way to remove or move it", () => {
    setup();

    const box = sectionBox();
    const items = within(box).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    const settle = items.at(-1) as HTMLElement;
    expect(settle).toHaveTextContent("To settle");
    expect(within(settle).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(settle).queryByRole("button")).not.toBeInTheDocument();
    expect(within(box).queryByRole("textbox", { name: "Section 5" })).not.toBeInTheDocument();
  });

  it("never sends To settle back in the editable sections", () => {
    const value = toFormValue(FAMILY_VACATION);

    expect(value.sections).toEqual(["Where to stay", "Getting there", "Daily outline", "Costs"]);
  });

  it("renames, adds and removes plan sections", async () => {
    const { user, onValue } = setup();

    await user.type(screen.getByRole("textbox", { name: "Section 1" }), " in town");
    await user.click(screen.getByRole("button", { name: "Add a section" }));
    await user.type(screen.getByRole("textbox", { name: "Section 5" }), "Packing");
    await user.click(screen.getByRole("button", { name: "Remove section 2" }));

    expect(lastValue(onValue).sections).toEqual([
      "Where to stay in town",
      "Daily outline",
      "Costs",
      "Packing",
    ]);
  });

  it("moves sections up and down within the limits of the list", async () => {
    const { user, onValue } = setup();

    await user.click(screen.getByRole("button", { name: "Move section 2 up" }));
    expect(lastValue(onValue).sections.slice(0, 2)).toEqual(["Getting there", "Where to stay"]);
    await user.click(screen.getByRole("button", { name: "Move section 4 down" }));

    expect(screen.getByRole("button", { name: "Move section 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move section 4 down" })).toBeDisabled();
    expect(lastValue(onValue).sections).toEqual([
      "Getting there",
      "Where to stay",
      "Daily outline",
      "Costs",
    ]);
  });

  it("stops adding sections at seven, because To settle takes the eighth place", async () => {
    const { user } = setup(
      toFormValue(
        makeTemplate({ plan_sections: ["A", "B", "C", "D", "E", "F", "G", "To settle"] }),
      ),
    );

    expect(within(sectionBox()).getAllByRole("textbox")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Add a section" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove section 7" }));
    expect(screen.getByRole("button", { name: "Add a section" })).toBeEnabled();
  });

  it("adds and removes suggested facts up to ten", async () => {
    const { user, onValue } = setup();

    await user.click(screen.getByRole("button", { name: "Add a suggested fact" }));
    await user.type(screen.getByRole("textbox", { name: "Fact 4 name" }), "Headcount");
    await user.type(screen.getByRole("textbox", { name: "Fact 4 hint" }), "Who is coming");
    await user.click(screen.getByRole("button", { name: "Remove fact 1" }));

    expect(lastValue(onValue).facts).toEqual([
      { key: "Budget", hint: "Total for the trip" },
      { key: "Destination", hint: "Where you are going" },
      { key: "Headcount", hint: "Who is coming" },
    ]);
  });

  it("stops adding facts at the limit", () => {
    const facts = Array.from({ length: TEMPLATE_FACTS_MAX }, (_, index) => ({
      key: `Fact ${index}`,
      hint: "",
    }));
    setup(toFormValue(makeTemplate({ facts })));

    expect(screen.getByRole("button", { name: "Add a suggested fact" })).toBeDisabled();
  });

  it("adds and removes tips up to five", async () => {
    const { user, onValue } = setup();

    await user.click(screen.getByRole("button", { name: "Add a tip" }));
    await user.click(screen.getByRole("button", { name: "Add a tip" }));
    expect(screen.getByRole("button", { name: "Add a tip" })).toBeDisabled();
    expect(screen.getAllByRole("textbox", { name: /^Tip \d$/ })).toHaveLength(TEMPLATE_TIPS_MAX);
    await user.click(screen.getByRole("button", { name: "Remove tip 1" }));

    expect(lastValue(onValue).tips).toEqual(["Set the budget", "Add the dates", "", ""]);
  });

  it("keeps Enter from submitting an enclosing form", async () => {
    const submitted = vi.fn((event: SubmitEvent<HTMLFormElement>) => event.preventDefault());
    const { user } = renderWithProviders(
      <form onSubmit={submitted}>
        <Harness initial={toFormValue(FAMILY_VACATION)} />
        <button type="submit">Save</button>
      </form>,
    );

    await user.type(screen.getByRole("textbox", { name: "Template name" }), "{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Fact 1 hint" }), "{Enter}");

    expect(submitted).not.toHaveBeenCalled();
  });

  it("shows template text as text, never as markup", () => {
    const { container } = setup(
      toFormValue(
        makeTemplate({
          name: "<img src=x onerror=alert(1)>",
          tips: ["<script>alert(1)</script>"],
          combine_hint: "<b>bold</b>",
        }),
      ),
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Tip 1" })).toHaveValue("<script>alert(1)</script>");
  });
});
