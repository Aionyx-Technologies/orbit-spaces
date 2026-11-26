import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseTheme, THEME_CHOICES, THEME_COOKIE, themeAttribute, themeCookie } from "@/lib/theme";
import { applyTheme, readTheme, serverTheme, subscribeTheme } from "@/lib/theme-store";
import { useTheme } from "@/lib/use-theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});

describe("theme choices", () => {
  it("offers system, light and dark", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    ["neon", "system"],
    ["", "system"],
    [undefined, "system"],
    [null, "system"],
  ] as const)("reads %s as %s", (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });

  it("only forces a theme when the person chose one", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeUndefined();
  });
});

describe("themeCookie", () => {
  it("lasts a year for an explicit choice and clears itself for system", () => {
    expect(themeCookie("dark", false)).toBe(
      `${THEME_COOKIE}=dark; Path=/; SameSite=Lax; Max-Age=31536000`,
    );
    expect(themeCookie("system", false)).toContain("Max-Age=0");
  });

  it("is only marked secure over https", () => {
    expect(themeCookie("light", true)).toMatch(/; Secure$/);
    expect(themeCookie("light", false)).not.toContain("Secure");
  });
});

describe("theme store", () => {
  it("starts as system on the server and when nothing was chosen", () => {
    expect(serverTheme()).toBe("system");
    expect(readTheme()).toBe("system");
  });

  it("applies a choice to the page, remembers it and tells listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readTheme()).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(listener).toHaveBeenCalledTimes(1);

    applyTheme("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readTheme()).toBe("system");
    expect(document.cookie).not.toContain(`${THEME_COOKIE}=dark`);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    applyTheme("light");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("useTheme", () => {
  it("follows changes made anywhere in the app", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");

    act(() => result.current[1]("light"));

    expect(result.current[0]).toBe("light");

    act(() => applyTheme("dark"));

    expect(result.current[0]).toBe("dark");
  });
});
