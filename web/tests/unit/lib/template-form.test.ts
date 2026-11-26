import { describe, expect, it } from "vitest";

import {
  canSaveTemplate,
  MAX_EDITABLE_SECTIONS,
  toFormValue,
  toTemplateInput,
} from "@/lib/template-form";
import { FAMILY_VACATION, makeTemplate, templateInputOf } from "@/tests/unit/helpers/fixtures";

describe("toFormValue", () => {
  it("copies the template and leaves To settle out of the editable sections", () => {
    const value = toFormValue(FAMILY_VACATION);

    expect(value.name).toBe("Trip");
    expect(value.sections).toEqual(["Where to stay", "Getting there", "Daily outline", "Costs"]);
    expect(value.facts).toEqual(FAMILY_VACATION.facts);
    expect(value.facts).not.toBe(FAMILY_VACATION.facts);
    expect(value.tips).toEqual(FAMILY_VACATION.tips);
  });

  it("drops To settle wherever it sits and however it is written", () => {
    const value = toFormValue(makeTemplate({ plan_sections: ["A", "  to SETTLE ", "B"] }));

    expect(value.sections).toEqual(["A", "B"]);
  });
});

describe("toTemplateInput", () => {
  it("trims, drops blank rows and always ends with To settle", () => {
    const input = toTemplateInput({
      name: "  Wedding ",
      description: " Plan it ",
      facts: [
        { key: " Guests ", hint: " How many " },
        { key: "  ", hint: "orphan hint" },
      ],
      sections: ["Venue", "  ", " Catering "],
      combineHint: "  Keep calm ",
      tips: ["", " Share a list "],
    });

    expect(input).toEqual({
      name: "Wedding",
      description: "Plan it",
      facts: [{ key: "Guests", hint: "How many" }],
      plan_sections: ["Venue", "Catering", "To settle"],
      combine_hint: "Keep calm",
      tips: ["Share a list"],
    });
  });

  it("round-trips a built-in template", () => {
    expect(toTemplateInput(toFormValue(FAMILY_VACATION))).toEqual(templateInputOf(FAMILY_VACATION));
  });
});

describe("limits", () => {
  it("leaves seven editable sections because To settle takes the eighth", () => {
    expect(MAX_EDITABLE_SECTIONS).toBe(7);
  });

  it("needs a name before a template can be saved", () => {
    const value = toFormValue(makeTemplate());

    expect(canSaveTemplate(value)).toBe(true);
    expect(canSaveTemplate({ ...value, name: "   " })).toBe(false);
  });
});
