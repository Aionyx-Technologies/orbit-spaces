import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareItemMenu } from "@/components/space/share-item-menu";
import { renderPlain } from "@/tests/unit/helpers/render";

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/download", () => download);
vi.mock("@/lib/clipboard", () => clipboard);
vi.mock("sonner", () => ({ toast: toasts }));

const MARKDOWN = "# Morning flight\n\nLeaves at 7:10\n";

describe("ShareItemMenu", () => {
  beforeEach(() => {
    download.downloadTextFile.mockReset();
    clipboard.copyText.mockReset();
    toasts.success.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
  });

  async function open() {
    const view = renderPlain(<ShareItemMenu title="Morning flight" content="Leaves at 7:10" />);
    await view.user.click(screen.getByRole("button", { name: "Share Morning flight" }));
    return view;
  }

  it("copies the item as text", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = await open();

    await user.click(await screen.findByRole("menuitem", { name: "Copy text" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(MARKDOWN);
    expect(toasts.success).toHaveBeenCalledWith("Copied “Morning flight”");
  });

  it("does not offer sharing by email", async () => {
    await open();

    await screen.findByRole("menuitem", { name: "Copy text" });
    expect(screen.queryByRole("menuitem", { name: "Email" })).not.toBeInTheDocument();
  });

  it("still saves the item as a Markdown file", async () => {
    const { user } = await open();

    await user.click(await screen.findByRole("menuitem", { name: "Download as Markdown" }));

    expect(download.downloadTextFile).toHaveBeenCalledWith("morning-flight.md", MARKDOWN);
  });

  it("offers the device's own share sheet only where the browser has one", async () => {
    const { unmount } = await open();
    expect(screen.queryByRole("menuitem", { name: "Share to an app…" })).not.toBeInTheDocument();
    unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const { user } = await open();

    await user.click(await screen.findByRole("menuitem", { name: "Share to an app…" }));

    expect(share).toHaveBeenCalledWith({ title: "Morning flight", text: MARKDOWN });
  });
});
