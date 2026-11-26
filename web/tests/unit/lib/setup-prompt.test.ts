import { describe, expect, it } from "vitest";

import { setupPrompt } from "@/lib/setup-prompt";

const MCP_URL = "https://orbit.example.com/mcp";

describe("setupPrompt", () => {
  it("gives the assistant this server's connector address", () => {
    const prompt = setupPrompt(MCP_URL);

    expect(prompt).toContain(`Its connector address is:\n${MCP_URL}`);
    expect(prompt).toContain(`claude mcp add --transport http orbit ${MCP_URL}`);
  });

  it("covers the chat apps that cannot add a connector themselves", () => {
    const prompt = setupPrompt(MCP_URL);

    for (const app of ["**ChatGPT:**", "**Claude:**", "**Grok:**"]) {
      expect(prompt).toContain(app);
    }
  });

  it("checks the connection with a read-only call and changes nothing during setup", () => {
    const prompt = setupPrompt(MCP_URL);

    expect(prompt).toContain("call list_spaces");
    expect(prompt).toContain("Never say setup worked until list_spaces succeeds.");
    expect(prompt).toContain(
      "Do not share, remember, combine, create, invite or delete anything during setup.",
    );
  });

  it("never asks for secrets in the chat", () => {
    expect(setupPrompt(MCP_URL)).toContain(
      "Never ask me to paste a password, code or token into this chat.",
    );
  });

  it("sends Muse to a section about secure connect forms and public clients", () => {
    const prompt = setupPrompt(MCP_URL);

    expect(prompt).toContain("- Muse: follow section 3b.");
    expect(prompt).toContain("## 3b. If you are Muse");
    expect(prompt).toContain("there is never a client secret");
    expect(prompt).toContain("Never invent a client ID. Never ask me for a secret.");
  });

  it("asks the assistant to stay consistent about client IDs", () => {
    expect(setupPrompt(MCP_URL)).toContain(
      "do not say I won't need a client ID and then ask me for one",
    );
  });

  it("uses only the address it was given", () => {
    expect(setupPrompt(MCP_URL)).not.toContain("orbitspaces.ai");
  });
});
