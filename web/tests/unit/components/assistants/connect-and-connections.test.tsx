import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConnectSection } from "@/components/assistants/connect-section";
import { ConnectionsSection } from "@/components/assistants/connections-section";
import type { Connection } from "@/lib/api.types";
import { makeConnection } from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const MCP_URL = "https://orbit.example.com/mcp";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/assistants"),
}));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);
vi.mock("@/lib/clipboard", () => clipboard);

function setupConnect(connections: Connection[] = []) {
  return renderWithProviders(
    <ConnectSection mcpUrl={MCP_URL} initialConnections={{ connections }} />,
  );
}

describe("ConnectSection", () => {
  it("shows the connector address in a read-only field that selects itself", async () => {
    const { user } = setupConnect();

    const field = screen.getByRole("textbox", { name: "Orbit connector address" });
    expect(field).toHaveValue(MCP_URL);
    expect(field).toHaveAttribute("readonly");

    await user.click(field);

    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe(MCP_URL.length);
  });

  it("copies the address", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = setupConnect();

    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(MCP_URL);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("copies a setup prompt that carries the connector address", async () => {
    clipboard.copyText.mockResolvedValue(true);
    const { user } = setupConnect();

    await user.click(screen.getByRole("button", { name: "Copy setup prompt" }));

    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining(MCP_URL));
    expect(clipboard.copyText).toHaveBeenCalledWith(
      expect.stringContaining("Connect Orbit to my AI assistant."),
    );
  });

  it("is a named region that reassures people nothing is shared by itself", () => {
    setupConnect();

    const region = screen.getByRole("region", { name: "Connect an assistant" });
    expect(region).toHaveTextContent("Nothing is shared until you ask your assistant to share it.");
  });

  it("has a short guide for each assistant, closed until opened", async () => {
    const { user } = setupConnect();

    for (const name of ["ChatGPT", "Grok", "Claude"]) {
      const details = screen.getByText(name, { selector: "summary" }).closest("details");
      expect(details).not.toHaveAttribute("open");
      expect(within(details as HTMLElement).getAllByRole("listitem")).toHaveLength(4);
    }

    await user.click(screen.getByText("Grok", { selector: "summary" }));

    expect(screen.getByText("Grok", { selector: "summary" }).closest("details")).toHaveAttribute(
      "open",
    );
    expect(
      screen.getByText("ChatGPT", { selector: "summary" }).closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("shows each assistant's logo beside its guide", () => {
    setupConnect();

    for (const [name, assistant] of [
      ["ChatGPT", "chatgpt"],
      ["Grok", "grok"],
      ["Claude", "claude"],
    ]) {
      expect(screen.getByText(name, { selector: "summary" }).querySelector("svg")).toHaveAttribute(
        "data-assistant",
        assistant,
      );
    }
  });

  it("admits that menus change and points back at the address", () => {
    setupConnect();

    expect(
      screen.getByText("Menus change often. The address above is the only thing you need."),
    ).toBeInTheDocument();
  });
});

describe("ConnectionsSection", () => {
  function setup(
    connections = [
      makeConnection(),
      makeConnection({ id: "conn-2", client_name: "Grok", client_host: "grok.com" }),
    ],
  ) {
    return renderWithProviders(<ConnectionsSection initial={{ connections }} />);
  }

  it("lists each connected assistant with where it connects from", () => {
    setup();

    const region = screen.getByRole("region", { name: "Connected assistants" });
    const rows = within(region).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("ChatGPT")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("chatgpt.com · Connected");
    expect(within(rows[1] as HTMLElement).getByText("Grok")).toBeInTheDocument();
  });

  it("shows the logo of each connected assistant, and a plug for one without a logo", () => {
    setup([
      makeConnection(),
      makeConnection({ id: "conn-3", client_name: "Claude", client_host: "claude.ai" }),
      makeConnection({ id: "conn-4", client_name: "Mystery tool", client_host: "example.org" }),
    ]);

    const rows = within(screen.getByRole("region", { name: "Connected assistants" })).getAllByRole(
      "listitem",
    );
    expect(rows[0]?.querySelector("svg")).toHaveAttribute("data-assistant", "chatgpt");
    expect(rows[1]?.querySelector("svg")).toHaveAttribute("data-assistant", "claude");
    expect(rows[2]?.querySelector('[data-slot="assistant-mark"]')).not.toBeInTheDocument();
    expect(rows[2]?.querySelector("svg.lucide-plug-zap")).toBeInTheDocument();
  });

  it("says what to do when nothing is connected yet", () => {
    setup([]);

    expect(
      screen.getByText("Nothing is connected yet. Add the address above to an assistant."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("names each Revoke button after its assistant", () => {
    setup();

    expect(screen.getByRole("button", { name: "Revoke ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Grok" })).toBeInTheDocument();
  });

  it("asks before revoking, then removes the assistant and confirms", async () => {
    const mock = mockFetch({
      "DELETE /api/connections/conn-1": emptyResponse(),
      "GET /api/connections": jsonResponse({
        connections: [
          makeConnection({ id: "conn-2", client_name: "Grok", client_host: "grok.com" }),
        ],
      }),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));
    const dialog = screen.getByRole("alertdialog", { name: "Disconnect ChatGPT?" });
    expect(dialog).toHaveAccessibleDescription(
      "It will stop being able to read or share in your spaces. You can connect it again later.",
    );
    expect(mock.calls).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Revoke ChatGPT" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Grok" })).toBeInTheDocument();
    expect(toasts.success).toHaveBeenCalledWith("ChatGPT was disconnected");
    expect(mock.callsTo("DELETE", "/api/connections/conn-1")).toHaveLength(1);
  });

  it("shows the empty state once the last assistant is revoked", async () => {
    mockFetch({
      "DELETE /api/connections/conn-1": emptyResponse(),
      "GET /api/connections": jsonResponse({ connections: [] }),
    });
    const { user } = setup([makeConnection()]);

    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(await screen.findByText(/Nothing is connected yet/)).toBeInTheDocument();
  });

  it("keeps the assistant when the person changes their mind", async () => {
    const mock = mockFetch({});
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke ChatGPT" })).toBeInTheDocument();
    expect(mock.calls).toHaveLength(0);
  });

  it("shows the server's message and keeps everything when revoking fails", async () => {
    mockFetch({
      "DELETE /api/connections/conn-1": errorResponse(
        404,
        "not_found",
        "That connection no longer exists.",
      ),
    });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));

    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That connection no longer exists.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("forgets the error after Cancel", async () => {
    mockFetch({
      "DELETE /api/connections/conn-1": errorResponse(500, "server_error", "Something broke."),
    });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      "DELETE /api/connections/conn-1": errorResponse(
        401,
        "unauthenticated",
        "Sign in to continue.",
      ),
    });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));

    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fassistants"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows progress while revoking", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch({
      "DELETE /api/connections/conn-1": () => gate.promise,
      "GET /api/connections": jsonResponse({ connections: [] }),
    });
    const { user } = setup([makeConnection()]);
    await user.click(screen.getByRole("button", { name: "Revoke ChatGPT" }));

    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(await screen.findByRole("button", { name: "Revoking…" })).toBeDisabled();
    gate.resolve(emptyResponse());
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
  });
});
