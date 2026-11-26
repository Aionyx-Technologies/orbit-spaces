import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SetupGuide } from "@/components/setup/setup-guide";
import { renderPlain } from "@/tests/unit/helpers/render";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);

const MCP_URL = "https://orbitspaces.ai/mcp";

describe("SetupGuide", () => {
  it("copies the full setup prompt with this server's address", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = renderPlain(<SetupGuide mcpUrl={MCP_URL} />);

    await user.click(screen.getByRole("button", { name: "Copy setup prompt" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(
      expect.stringContaining(`Its connector address is:\n${MCP_URL}`),
    );
  });

  it("walks through the prompt, manual setup, sign-in, checks and features in order", () => {
    renderPlain(<SetupGuide mcpUrl={MCP_URL} />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      "Let your assistant do it",
      "Connect it yourself",
      "Sign in and allow",
      "Check that it works",
      "What you can do in Orbit",
      "Ready when you are",
    ]);
  });

  it("has steps for every assistant, with a link to the ones that have a connectors page", () => {
    renderPlain(<SetupGuide mcpUrl={MCP_URL} />);

    const connect = screen.getByRole("region", { name: "Connect it yourself" });
    for (const name of ["ChatGPT", "Claude", "Grok", "Muse", "OpenClaw", "Hermes Agent", "Wabi"]) {
      expect(within(connect).getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(within(connect).getByRole("link", { name: /Open Claude connectors/ })).toHaveAttribute(
      "href",
      "https://claude.ai/settings/connectors",
    );
    expect(connect).toHaveTextContent(`claude mcp add --transport http orbit ${MCP_URL}`);
  });

  it("says when the address is only a placeholder", () => {
    renderPlain(<SetupGuide mcpUrl={null} />);

    expect(screen.getByText(/the address below is a placeholder/)).toBeInTheDocument();
    expect(screen.getByText("https://your-orbit-address/mcp")).toBeInTheDocument();
  });
});
