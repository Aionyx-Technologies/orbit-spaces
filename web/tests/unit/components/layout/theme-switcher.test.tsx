import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { THEME_COOKIE } from "@/lib/theme";
import { renderPlain } from "@/tests/unit/helpers/render";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});

describe("ThemeSwitcher", () => {
  it("offers system, light and dark, with the current one ticked", async () => {
    const { user } = renderPlain(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Theme" }));

    expect(screen.getByRole("menuitemradio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).not.toBeChecked();
  });

  it("applies a choice to the page and remembers it", async () => {
    const { user } = renderPlain(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);

    await user.click(screen.getByRole("button", { name: "Theme" }));

    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
  });

  it("goes back to following the system", async () => {
    document.documentElement.dataset.theme = "light";
    const { user } = renderPlain(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toBeChecked();
    await user.click(screen.getByRole("menuitemradio", { name: "System" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
