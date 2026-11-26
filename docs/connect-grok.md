# Connect Grok

Before you start, Orbit must be reachable at a public HTTPS address, for example `https://orbit.example.com`. Grok connects from xAI's servers, so `localhost` and private addresses will not work. If you have not set that up yet, see [self-hosting](self-hosting.md) or [Railway](deploy-railway.md).

The connector address is your Orbit address followed by `/mcp`. You can also copy it from Orbit on the **Assistants** tab.

## How sure are these steps

Less sure than the [Claude](connect-claude.md) guide. xAI's own documentation could not be opened while this guide was written, so the steps below come from a third-party guide dated October 2026 and from search summaries of xAI's pages. Connector screens in Grok change often. Check each step against what you see, and treat the plan details as **unverified**.

Nothing about Orbit depends on Grok's exact menus: Grok needs a public HTTPS address for a remote MCP server and a sign-in (OAuth) flow, and Orbit provides both.

## Add the connector on grok.com

1. Open <https://grok.com/connectors>.
2. Choose **New Connector**, then **Custom**.
3. Enter the connector address, `https://your-domain/mcp`.
4. When Grok sends you to Orbit, enter your email address. Orbit emails you a link that works once for 15 minutes.
5. Open the link and press **Continue to Orbit**.
6. Orbit asks whether Grok may connect to your spaces. Check the address it says it will send you back to, and press **Allow**.

Grok then lists Orbit's tools and can use them in chat.

**Plans.** One guide says any Grok user on a paid plan can add a remote connector. Others say connectors are open to all users. For Grok Business and Enterprise, a team admin may have to provision the connector for the team before members can use it. Check which applies to your account.

## Use it

Ask Grok to use Orbit. Try:

- "Show my Orbit spaces."
- "Share this to the Goa trip space in Orbit: Hotel shortlist, three options under $150 a night."
- "Remember in the Goa trip space that we leave on Dec 20."
- "What has Alex shared in the Goa trip space?"
- "Ask Orbit to combine everything in the Goa trip space into one plan."

Orbit only shares what you ask it to. Grok decides when to call a connector, so if it answers from its own knowledge instead, say "use Orbit".

## Using the xAI API instead

Developers can pass Orbit to the xAI API as a remote MCP tool with the server address `https://your-domain/mcp`. Orbit uses OAuth, so an API caller has to complete the sign-in flow itself and supply the resulting access token. This guide does not cover that.

## Disconnect

Open Orbit, go to **Assistants**, find Grok under connected assistants, and choose **Revoke**. To remove the connector from Grok as well, delete it on <https://grok.com/connectors>.

## If it does not work

- **It cannot connect.** Open `https://your-domain/.well-known/oauth-protected-resource/mcp` in a browser. You should see a small block of JSON that mentions your connector address. If you do not, the address is wrong or not public.
- **There is no way to add a custom connector.** Your plan or workspace may not allow it yet. You can still use Orbit on the web.
- **The sign-in email did not arrive.** Check spam, and ask whoever runs your Orbit whether email is set up.
