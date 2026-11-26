import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectSection } from "@/components/assistants/connect-section";
import type { Connection } from "@/lib/api.types";
import { ASSISTANT_LINKS } from "@/lib/assistant-links";
import { makeConnection } from "@/tests/unit/helpers/fixtures";
import { emptyResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";
import { ConnectionsSection } from "@/components/assistants/connections-section";

const MCP_URL = "https://orbit.example.com/mcp";

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/clipboard", () => clipboard);
vi.mock("sonner", () => ({ toast: toasts }));

const WITH_CONNECTOR_PAGE = ["ChatGPT", "Grok", "Claude"];
const COPY_ONLY = ["Muse", "OpenClaw", "Hermes Agent", "Wabi"];
const ALL_ASSISTANTS = [...WITH_CONNECTOR_PAGE, ...COPY_ONLY];

function setup(connections: Connection[] = []) {
  return renderWithProviders(
    <ConnectSection mcpUrl={MCP_URL} initialConnections={{ connections }} />,
  );
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name, { selector: "summary" }).closest("li");
  return row as HTMLElement;
}

describe("ConnectSection assistant buttons", () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clipboard.copyText.mockReset();
    clipboard.copyText.mockResolvedValue(true);
    open = vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the assistants in the same order, each with a Connect button", () => {
    setup();

    const names = screen
      .getAllByRole("listitem")
      .map((row) => row.querySelector("summary")?.textContent)
      .filter(Boolean);
    expect(names).toEqual(ALL_ASSISTANTS);
    for (const name of ALL_ASSISTANTS) {
      const button = within(rowOf(name)).getByRole("button", { name: `Connect ${name}` });
      expect(button).toBeVisible();
      expect(button).toHaveTextContent(/^Connect$/);
    }
  });

  it("never says Connect another or shows a Connected badge", () => {
    setup([makeConnection({ client_name: "Claude", client_host: "claude.ai" })]);

    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect another/ })).not.toBeInTheDocument();
  });

  it("leaves a connected assistant out of the list, since the connected list shows it", () => {
    setup([makeConnection({ client_name: "Claude", client_host: "claude.ai" })]);

    expect(screen.queryByText("Claude", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Claude" })).not.toBeInTheDocument();
    for (const name of ALL_ASSISTANTS.filter((candidate) => candidate !== "Claude")) {
      expect(within(rowOf(name)).getByRole("button", { name: `Connect ${name}` })).toBeVisible();
    }
  });

  it("keeps the order of the assistants that are left", () => {
    setup([makeConnection({ client_name: "Grok", client_host: "grok.com" })]);

    const names = screen
      .getAllByRole("listitem")
      .map((row) => row.querySelector("summary")?.textContent)
      .filter(Boolean);
    expect(names).toEqual(ALL_ASSISTANTS.filter((name) => name !== "Grok"));
  });

  it("leaves out an assistant without a connectors page once it is connected", () => {
    setup([makeConnection({ client_name: "Muse", client_host: "muse.example" })]);

    expect(screen.queryByText("Muse", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.getByText("OpenClaw", { selector: "summary" })).toBeInTheDocument();
  });

  it("matches the connected client by name, however it is spelled", () => {
    setup([
      makeConnection({ id: "a", client_name: "ChatGPT (OpenAI)" }),
      makeConnection({ id: "b", client_name: "grok-web" }),
    ]);

    expect(screen.queryByText("ChatGPT", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Grok", { selector: "summary" })).not.toBeInTheDocument();
    expect(screen.getByText("Claude", { selector: "summary" })).toBeInTheDocument();
  });

  it("keeps every assistant when the connected client is not recognised", () => {
    setup([makeConnection({ client_name: "Mystery tool", client_host: "example.org" })]);

    const names = screen
      .getAllByRole("listitem")
      .map((row) => row.querySelector("summary")?.textContent)
      .filter(Boolean);
    expect(names).toEqual(ALL_ASSISTANTS);
  });

  it("leaves an assistant out once, however many times it is connected", () => {
    setup([
      makeConnection({ id: "a", client_name: "Claude" }),
      makeConnection({ id: "b", client_name: "Claude" }),
    ]);

    expect(document.querySelectorAll("summary")).toHaveLength(ALL_ASSISTANTS.length - 1);
  });

  it("says so, with no list, when every assistant listed is connected", () => {
    setup(
      ALL_ASSISTANTS.map((name, index) =>
        makeConnection({ id: `c${index}`, client_name: name, client_host: "example.org" }),
      ),
    );

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Connect / })).not.toBeInTheDocument();
    expect(screen.getByText(/Every assistant listed here is connected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });

  it("copies the address and opens the connectors page in a new tab on one click", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Claude" }));

    expect(clipboard.copyText).toHaveBeenCalledTimes(1);
    expect(clipboard.copyText).toHaveBeenCalledWith(MCP_URL);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://claude.ai/settings/connectors",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("starts the copy and opens the page before it waits for the clipboard", async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<boolean>();
    clipboard.copyText.mockImplementation(() => {
      order.push("copy");
      return gate.promise;
    });
    open.mockImplementation(() => {
      order.push("open");
      return null;
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Grok" }));

    expect(order).toEqual(["copy", "open"]);
    expect(screen.queryByRole("status", { name: /^Connect / })).not.toBeInTheDocument();
    gate.resolve(true);
    expect(await screen.findByRole("status", { name: "Connect Grok" })).toBeInTheDocument();
  });

  it("opens the right page for each assistant", async () => {
    const { user } = setup();

    for (const link of ASSISTANT_LINKS.filter((candidate) => candidate.connectorsUrl)) {
      await user.click(screen.getByRole("button", { name: `Connect ${link.name}` }));
      expect(open).toHaveBeenLastCalledWith(link.connectorsUrl, "_blank", "noopener,noreferrer");
    }
    expect(open).toHaveBeenCalledTimes(WITH_CONNECTOR_PAGE.length);
  });

  it.each(COPY_ONLY)("copies the address for %s without opening a page", async (name) => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: `Connect ${name}` }));

    expect(clipboard.copyText).toHaveBeenCalledWith(MCP_URL);
    expect(open).not.toHaveBeenCalled();
    const notice = await screen.findByRole("status", { name: `Connect ${name}` });
    expect(notice).toHaveTextContent("Address copied.");
    expect(notice).toHaveTextContent("add a remote MCP server named Orbit and paste");
    expect(within(notice).queryByRole("link")).not.toBeInTheDocument();
    expect(within(notice).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("shows the address selected with a hint when copying fails for an assistant without a page", async () => {
    clipboard.copyText.mockResolvedValue(false);
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect OpenClaw" }));

    const notice = await screen.findByRole("status", { name: "Connect OpenClaw" });
    expect(notice).toHaveTextContent("Orbit could not copy the address for you.");
    expect(within(notice).getByRole("textbox")).toHaveValue(MCP_URL);
    expect(within(notice).getByText("Press Ctrl+C to copy")).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps an instruction on screen until it is dismissed", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Grok" }));

    const notice = await screen.findByRole("status", { name: "Connect Grok" });
    expect(notice).toHaveTextContent("Address copied.");
    expect(notice).toHaveTextContent("Click New Connector, choose Custom, and paste.");
    expect(notice).toHaveTextContent(
      "If it asks you to sign in, do that first, then open Connectors.",
    );
    expect(within(notice).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Open Grok connectors" })).toHaveAttribute(
      "href",
      "https://grok.com/connectors",
    );
    expect(toasts.success).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Connect Claude" }));
    expect(await screen.findByRole("status", { name: "Connect Claude" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: /^Connect / })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status", { name: /^Connect / })).not.toBeInTheDocument();
  });

  it("shows the address selected with a hint when copying fails", async () => {
    clipboard.copyText.mockResolvedValue(false);
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Claude" }));

    const notice = await screen.findByRole("status", { name: "Connect Claude" });
    expect(notice).toHaveTextContent("Orbit could not copy the address for you.");
    expect(notice).not.toHaveTextContent("Address copied.");
    const field = within(notice).getByRole("textbox", {
      name: "Orbit connector address to copy",
    }) as HTMLInputElement;
    expect(field).toHaveValue(MCP_URL);
    expect(field).toHaveAttribute("readonly");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(MCP_URL.length);
    expect(within(notice).getByText("Press Ctrl+C to copy")).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("selects the address again after a second failed attempt", async () => {
    clipboard.copyText.mockResolvedValue(false);
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Claude" }));
    const first = (await screen.findByRole("textbox", {
      name: "Orbit connector address to copy",
    })) as HTMLInputElement;
    first.setSelectionRange(2, 2);
    await user.click(screen.getByRole("button", { name: "Connect Claude" }));

    await waitFor(() => {
      const field = screen.getByRole("textbox", {
        name: "Orbit connector address to copy",
      }) as HTMLInputElement;
      expect(field.selectionEnd).toBe(MCP_URL.length);
      expect(field.selectionStart).toBe(0);
    });
  });

  it("says Cmd+C on a Mac", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
    clipboard.copyText.mockResolvedValue(false);
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Connect Claude" }));

    expect(await screen.findByText("Press Cmd+C to copy")).toBeInTheDocument();
  });

  it("keeps the plain address and Copy button on the page", () => {
    setup();

    expect(screen.getByRole("textbox", { name: "Orbit connector address" })).toHaveValue(MCP_URL);
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });

  it("brings the assistant back to the list once its connection is revoked", async () => {
    const connections = [makeConnection({ client_name: "Claude", client_host: "claude.ai" })];
    mockFetch({
      "DELETE /api/connections/conn-1": emptyResponse(),
      "GET /api/connections": jsonResponse({ connections: [] }),
    });
    const { user } = renderWithProviders(
      <>
        <ConnectSection mcpUrl={MCP_URL} initialConnections={{ connections }} />
        <ConnectionsSection initial={{ connections }} />
      </>,
    );
    expect(screen.queryByText("Claude", { selector: "summary" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke Claude" }));
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(screen.getByText("Claude", { selector: "summary" })).toBeInTheDocument(),
    );
    expect(
      within(rowOf("Claude")).getByRole("button", { name: "Connect Claude" }),
    ).toBeInTheDocument();
  });
});
