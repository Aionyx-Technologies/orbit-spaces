/*
 * The text a person pastes into their assistant to have it connect Orbit.
 * It follows the connect guides in docs/: the assistant does what it can from
 * where it runs, hands the person the clicks it cannot make, and checks the
 * connection with a read-only call before saying it worked.
 */
export function setupPrompt(mcpUrl: string): string {
  return `Connect Orbit to my AI assistant. That's you: do what you can, and guide me through anything that needs my input.

Orbit is a shared space for people who each use a different AI assistant. Its connector address is:
${mcpUrl}

## 1. Check this assistant

- Identify which assistant and app you are (ChatGPT, Claude, Grok, Muse, OpenClaw, Hermes Agent, Wabi or another). Ask only if you cannot tell.
- Check whether Orbit is already connected. Keep my other integrations and do not add a second Orbit.
- Muse: follow section 3b.

## 2. If you are a chat app

ChatGPT, Claude (claude.ai, desktop or mobile) and Grok cannot add a connector from inside a conversation. Do not run commands. Give me only the steps for this app, then stop:

- **ChatGPT:** open **Plugins**, choose **+** and add a custom MCP server named Orbit at the address above, with **OAuth** sign-in. Leave any client ID or secret empty. In older layouts, switch on **Developer mode** under **Settings → Apps → Advanced settings**, then **Create app**.
- **Claude:** open **Customize → Connectors**, choose **Add → Add custom connector**, name it Orbit, enter the address above and choose **Continue**. Under **OAuth client**, choose **Use Claude's published identity**, then **Add**. On Team and Enterprise plans an Owner adds it once under **Organization settings → Connectors**.
- **Grok:** open https://grok.com/connectors, choose **New Connector → Custom** and enter the address above.

Menus change often. If a label differs, tell me to look for the closest match.

## 3. If you can change your own settings

For agents that manage their own tools (for example Claude Code, OpenClaw or Hermes Agent):

- Check this agent's help or current documentation first.
- Add a remote MCP server named orbit, using Streamable HTTP, at the address above. In Claude Code that is: claude mcp add --transport http orbit ${mcpUrl}
- Change only what Orbit needs.

Assistants that run in the cloud need Orbit at a public HTTPS address. If the address above is localhost or a private address, tell me that and point me to Orbit's self-hosting guide.

## 3b. If you are Muse (or another assistant with a secure connect form)

- Orbit's OAuth uses PKCE with dynamic client registration. It is a public client: there is never a client secret.
- Set up the connection with OAuth and automatic registration first. Do not tell me a client ID is needed unless the form actually asks for one.
- If the connect form asks for a client ID, register this assistant with Orbit yourself using its registration endpoint, then give me the ID and tell me to paste it into the form and leave the secret empty. Say this at the start, in one message, so I'm not surprised.
- Never invent a client ID. Never ask me for a secret.
- If the form still won't proceed, tell me exactly what it asks for, then stop.

## 4. Sign in

Orbit uses a browser sign-in, with no API key. When the assistant opens Orbit, I enter my email, open the link or code Orbit sends me, press **Continue to Orbit**, then check the return address and press **Allow**. Never ask me to paste a password, code or token into this chat.

- Be consistent: do not say I won't need a client ID and then ask me for one. If your first setup attempt fails and you change method, tell me what changed and why.

## 5. Reload and check

- Reload the way this assistant expects, only if the new tools need it.
- Once Orbit's tools load, call list_spaces. It only reads.
- Do not share, remember, combine, create, invite or delete anything during setup.
- Never say setup worked until list_spaces succeeds. If I have no spaces yet, say so; do not create one unless I ask.

## 6. Finish with a short handoff

Keep it under 100 words:

**Status:** what worked, or what blocked setup and the fix.

**Try:**
- "Share this to Orbit."
- "What is new in our Orbit space?"
- "Ask Orbit to pull everything in our space into one plan."`;
}
