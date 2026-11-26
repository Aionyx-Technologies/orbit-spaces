import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "@/components/common/copy-button";
import { renderPlain } from "@/tests/unit/helpers/render";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);

describe("CopyButton", () => {
  beforeEach(() => {
    clipboard.copyText.mockReset();
  });

  it("copies the value and says so", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const onCopied = vi.fn();
    const { user } = renderPlain(
      <CopyButton value="https://orbit.example.com/mcp" label="Copy address" onCopied={onCopied} />,
    );

    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(clipboard.copyText).toHaveBeenCalledWith("https://orbit.example.com/mcp");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it("works with the keyboard", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = renderPlain(<CopyButton value="x" />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(clipboard.copyText).toHaveBeenCalledWith("x");
  });

  it("falls back to asking the person to copy by hand", async () => {
    clipboard.copyText.mockResolvedValue(false);
    const onCopied = vi.fn();
    const { user } = renderPlain(<CopyButton value="x" onCopied={onCopied} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("button", { name: "Select and copy" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed");
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("goes back to its label after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    clipboard.copyText.mockResolvedValue(true);
    const { user } = renderPlain(<CopyButton value="x" />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("supports custom labels", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = renderPlain(
      <CopyButton value="x" label="Copy link" copiedLabel="Link copied" />,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument();
  });
});
