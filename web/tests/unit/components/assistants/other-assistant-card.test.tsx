import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OtherAssistantCard } from "@/components/assistants/other-assistant-card";
import { renderPlain } from "@/tests/unit/helpers/render";

const MCP_URL = "https://orbit.example.com/mcp";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);

describe("OtherAssistantCard", () => {
  beforeEach(() => {
    clipboard.copyText.mockReset();
    clipboard.copyText.mockResolvedValue(true);
  });

  it("is a named card with the one sentence of help", () => {
    renderPlain(<OtherAssistantCard mcpUrl={MCP_URL} />);

    const region = screen.getByRole("region", { name: "Using a different assistant?" });
    expect(region).toHaveTextContent(
      "Add this address as a custom connector (MCP) in your assistant's settings.",
    );
  });

  it("shows the address in a read-only field that selects itself", async () => {
    const { user } = renderPlain(<OtherAssistantCard mcpUrl={MCP_URL} />);

    const field = screen.getByRole("textbox", { name: "Connector address" }) as HTMLInputElement;
    expect(field).toHaveValue(MCP_URL);
    expect(field).toHaveAttribute("readonly");
    await user.click(field);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(MCP_URL.length);
  });

  it("copies the address with its Copy button", async () => {
    const { user } = renderPlain(<OtherAssistantCard mcpUrl={MCP_URL} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(MCP_URL);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("names no assistant", () => {
    renderPlain(<OtherAssistantCard mcpUrl={MCP_URL} />);

    for (const name of ["Muse", "OpenClaw", "Hermes", "Wabi"]) {
      expect(screen.queryByText(new RegExp(name))).not.toBeInTheDocument();
    }
  });
});
