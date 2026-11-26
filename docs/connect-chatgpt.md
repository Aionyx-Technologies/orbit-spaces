# Connect ChatGPT

Before you start, Orbit must be reachable at a public HTTPS address, for example `https://orbit.example.com`. ChatGPT connects from OpenAI's servers, so `localhost` will not work. If you have not set that up yet, see [self-hosting](self-hosting.md) or [Railway](deploy-railway.md).

The connector address is your Orbit address followed by `/mcp`. You can also copy it from Orbit on the **Assistants** tab.

## Which plans can do this

This is the part to check first, because it decides whether ChatGPT can share into Orbit or only read from it.

When this guide was written (2026-11-19), the sources disagreed:

- OpenAI's developer documentation is reported to say custom MCP servers are available to Pro, Plus, Business, Enterprise and Education accounts on the web.
- OpenAI's help center is reported to say "Full MCP is only available to Business and Enterprise/Edu users, currently", and to limit Pro accounts to read and fetch tools.

OpenAI's own pages could not be opened while this guide was written, so those two statements come second-hand from a third-party summary. Treat the plan question as **unverified**.

What this means in practice:

- If ChatGPT can list your spaces and read them but refuses to share, remember or combine, your plan probably only allows read tools. Everything a write tool does can also be done on the Orbit web page, so nothing is blocked, only less convenient.
- If you find out which plan can and cannot write, please open an issue and say so. It is the most useful thing you can tell the project.

## Add the connector

OpenAI has moved this screen more than once, so the names below may differ slightly from what you see. These steps follow OpenAI's help center and two guides written in 2026.

**Newer layout (Plugins):**

1. In ChatGPT on the web, open **Plugins**.
2. Choose **+**, then the option to add a custom MCP server.
3. Enter the name `Orbit`. A description is optional.
4. Under **Connection**, enter `https://your-domain/mcp`.
5. For authentication choose **OAuth**. If it asks for a client ID or secret, leave them empty; Orbit registers ChatGPT automatically.
6. Read the warning, tick the box to confirm you trust the server, and create it.
7. Review the tools it found and install them.

**Older layout (Developer mode):**

1. Open **Settings**, then **Apps**, then **Advanced settings**, and switch on **Developer mode**. In some versions this is under **Connectors** or **Security and login**.
2. Choose **Create app** (or **Create**), enter the name `Orbit` and the address `https://your-domain/mcp`, and choose **OAuth** for authentication.
3. Tick the box to confirm you trust the server, then choose **Create**.

ChatGPT then opens an Orbit page:

1. Enter your email address. Orbit emails you a link that works once for 15 minutes.
2. Open the link and press **Continue to Orbit**.
3. Orbit asks whether ChatGPT may connect to your spaces. Check the address it says it will send you back to, and press **Allow**.

## Use it

In a new chat, pick Orbit from the **+** menu or by typing `@`. ChatGPT asks you to confirm any action that changes something, so you approve each share. Try:

- "Show my Orbit spaces."
- "Share this to the Goa trip space in Orbit: Morning flight on Dec 20."
- "Remember in the Goa trip space that the budget is $3,000."
- "What has Blake shared in the Goa trip space?"
- "Ask Orbit to combine everything in the Goa trip space into one plan."

Orbit only shares what you ask it to. ChatGPT decides when to call a connector, so if it answers from its own knowledge instead, say "use Orbit" or pick the connector explicitly.

## Disconnect

Open Orbit, go to **Assistants**, find ChatGPT under connected assistants, and choose **Revoke**. To remove the connector from ChatGPT as well, delete it in the same place you added it.

## If it does not work

- **It cannot connect.** Open `https://your-domain/.well-known/oauth-protected-resource/mcp` in a browser. You should see a small block of JSON that mentions your connector address. If you do not, the address is wrong or not public.
- **The tools are missing.** Remove the connector, add it again, and install the tools it lists.
- **It reads but will not write.** See [Which plans can do this](#which-plans-can-do-this).
- **The sign-in email did not arrive.** Check spam, and ask whoever runs your Orbit whether email is set up.
