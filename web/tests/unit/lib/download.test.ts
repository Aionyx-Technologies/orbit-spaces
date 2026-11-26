import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadTextFile } from "@/lib/download";

describe("downloadTextFile", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;
  let seen: { download: string; href: string; attached: boolean } | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => "blob:orbit-test");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    seen = undefined;
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      seen = { download: this.download, href: this.href, attached: this.isConnected };
    });
  });

  afterEach(() => {
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("saves the text as a file with the given name", async () => {
    downloadTextFile("plan.md", "# Plan\n");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(await blob.text()).toBe("# Plan\n");
    expect(click).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ download: "plan.md", href: "blob:orbit-test", attached: true });
  });

  it("takes the anchor out of the page afterwards", () => {
    downloadTextFile("plan.md", "x");

    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("lets the browser start the download, then releases the object URL", async () => {
    downloadTextFile("plan.md", "x");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orbit-test");
  });

  it("accepts another content type", async () => {
    downloadTextFile("data.csv", "a,b", "text/csv");

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/csv");
  });
});
