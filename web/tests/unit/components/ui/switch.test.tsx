import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { renderPlain } from "@/tests/unit/helpers/render";

function Controlled({ onChange }: { onChange: (value: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <Label htmlFor="notify">Goa trip</Label>
      <Switch
        id="notify"
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("Switch", () => {
  it("is named by its label and starts off", () => {
    renderPlain(<Controlled onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Goa trip" })).not.toBeChecked();
  });

  it("toggles with a click", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Goa trip" }));

    expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("toggles with the keyboard", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<Controlled onChange={onChange} />);

    await user.tab();
    await user.keyboard(" ");
    await user.keyboard(" ");

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("toggles when its label is clicked", async () => {
    const { user } = renderPlain(<Controlled onChange={vi.fn()} />);

    await user.click(screen.getByText("Goa trip"));

    expect(screen.getByRole("switch", { name: "Goa trip" })).toBeChecked();
  });

  it("cannot be toggled when disabled", async () => {
    const onChange = vi.fn();
    const { user } = renderPlain(<Switch aria-label="Muted" disabled onCheckedChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Muted" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
