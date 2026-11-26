import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/lib/clipboard";

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes to the clipboard and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("https://orbit.example.com/mcp")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://orbit.example.com/mcp");
  });

  it("reports failure when the browser refuses", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    await expect(copyText("x")).resolves.toBe(false);
  });

  it("reports failure when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});

    await expect(copyText("x")).resolves.toBe(false);
  });
});
