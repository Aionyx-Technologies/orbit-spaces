import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssistantsScreen } from "@/components/assistants/assistants-screen";
import { makeConnection, makeMe } from "@/tests/unit/helpers/fixtures";
import { renderWithProviders } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup(connections = [makeConnection()]) {
  return renderWithProviders(
    <AssistantsScreen me={makeMe()} initialConnections={{ connections }} />,
  );
}

describe("AssistantsScreen", () => {
  it("has the Assistants heading with one line of help right under it", () => {
    setup();

    const heading = screen.getByRole("heading", { level: 1, name: "Assistants" });
    expect(heading).toHaveClass("heading-page");
    const line = screen.getByText(
      "Connect the AI assistants you use, and see which ones have access.",
    );
    expect(heading.parentElement).toContainElement(line);
    expect(heading.parentElement).toHaveClass("flex", "flex-col", "gap-2");
    expect(line).not.toHaveClass("mt-1", "mt-2", "mt-3");
  });

  it("has no back to Spaces pill, because the top bar has both tabs", () => {
    setup();

    expect(screen.queryByRole("link", { name: "Spaces" })).not.toBeInTheDocument();
  });

  it("shows the connect card first and the connected list second, unchanged", () => {
    setup();

    const connect = screen.getByRole("region", { name: "Connect an assistant" });
    const connected = screen.getByRole("region", { name: "Connected assistants" });
    expect(
      connect.compareDocumentPosition(connected) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(connect).getByRole("textbox", { name: "Orbit connector address" })).toHaveValue(
      "https://orbit.example.com/mcp",
    );
    expect(within(connect).getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    for (const name of ["Grok", "Claude"]) {
      expect(within(connect).getByText(name)).toBeInTheDocument();
    }
    expect(within(connect).queryByText("ChatGPT")).not.toBeInTheDocument();
    expect(within(connected).getByRole("button", { name: "Revoke ChatGPT" })).toBeInTheDocument();
  });

  it("puts the different-assistant card between the connect card and the connected list", () => {
    setup();

    const connect = screen.getByRole("region", { name: "Connect an assistant" });
    const other = screen.getByRole("region", { name: "Using a different assistant?" });
    const connected = screen.getByRole("region", { name: "Connected assistants" });
    expect(connect.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      other.compareDocumentPosition(connected) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(other).getByRole("textbox", { name: "Connector address" })).toHaveValue(
      "https://orbit.example.com/mcp",
    );
    expect(within(other).getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("leaves the connected assistant out of the top list and offers a Connect button for the rest", () => {
    setup();

    const connect = screen.getByRole("region", { name: "Connect an assistant" });
    expect(within(connect).queryByText("Connected")).not.toBeInTheDocument();
    expect(within(connect).queryByText("ChatGPT", { selector: "summary" })).not.toBeInTheDocument();
    expect(within(connect).queryByRole("button", { name: /ChatGPT/ })).not.toBeInTheDocument();
    expect(within(connect).getByRole("button", { name: "Connect Grok" })).toBeInTheDocument();
    expect(within(connect).getByRole("button", { name: "Connect Claude" })).toBeInTheDocument();
  });

  it("says nothing is connected yet when there are no connections", () => {
    setup([]);

    expect(screen.getByText(/Nothing is connected yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it("keeps the anchors the old settings links used", () => {
    const { container } = setup();

    expect(container.querySelector("#connect-title")).toBeInTheDocument();
    expect(container.querySelector("#connections-title")).toBeInTheDocument();
    expect(container.querySelector("#connector-address")).toBeInTheDocument();
  });
});
