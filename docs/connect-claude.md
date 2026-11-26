# Connect Claude

Claude can add Orbit as a custom connector on the Free, Pro, Max, Ultra, Team and Enterprise plans (Free is limited to one custom connector).

Before you start, Orbit must be reachable at a public HTTPS address on the standard port 443, for example `https://orbit.example.com`. Claude connects from Anthropic's servers, not from your device, so `localhost`, a VPN-only address, or a URL with a port such as `:8443` will not work. If you have not set that up yet, see [self-hosting](self-hosting.md) or [Railway](deploy-railway.md).

The connector address is your Orbit address followed by `/mcp`. You can also copy it from Orbit on the **Assistants** tab.

## Add the connector (Free, Pro and Max)

These steps follow Anthropic's help article "Get started with custom connectors using remote MCP", checked on 2026-11-19. Menu names change from time to time, so if a label differs, look for the closest match.

1. In Claude, go to **Customize** and then **Connectors**.
2. Choose **Add**, then **Add custom connector**.
3. Enter a name, for example `Orbit`.
4. Enter the connector address, `https://your-domain/mcp`, and choose **Continue**.
5. Check the detected sign-in settings and choose **Continue**.
6. Under **Authentication**, choose **Sign in now**.
7. Under **OAuth client**, choose **Use Claude's published identity (Recommended)**. **Register automatically** also works. Leave request headers empty.
8. Choose **Add**.

Claude opens an Orbit page in your browser:

1. Enter your email address. Orbit emails you a link that works once for 15 minutes.
2. Open the link and press **Continue to Orbit**.
3. Orbit asks whether Claude may connect to your spaces. Check the address it says it will send you back to, and press **Allow**.

## Add the connector (Team and Enterprise)

An Owner adds it once under **Organization settings**, then **Connectors**: **Add**, hover over **Custom**, choose **Web**, and follow the same name, address, authentication and OAuth client steps as above. Each member then goes to **Customize**, then **Connectors**, finds the connector labelled **Custom**, and chooses **Connect**. Every member signs in to Orbit as themselves, so people only ever reach their own spaces.

## Use it

Turn Orbit on for a conversation with the **+** button at the lower left of the chat box, then **Connectors**. Claude asks before it uses a tool, so you approve each action the first time. Try:

- "Show my Orbit spaces."
- "Share this to the Goa trip space in Orbit: Morning flight on Dec 20."
- "Remember in the Goa trip space that the budget is $3,000."
- "What has Blake shared in the Goa trip space?"
- "Ask Orbit to combine everything in the Goa trip space into one plan."

Orbit only shares what you ask it to. Reading is separate from writing, so you can allow reads without allowing writes in Claude's tool settings.

## Change or remove it

- To change a connector, remove it and add it again.
- To disconnect Claude from your Orbit account, open Orbit, go to **Assistants**, find Claude under connected assistants, and choose **Revoke**.

## If it does not work

- **It cannot connect.** Open `https://your-domain/.well-known/oauth-protected-resource/mcp` in a browser. You should see a small block of JSON that mentions your connector address. If you do not, the address is wrong or not public.
- **It says the address is not allowed or the host is invalid.** Orbit's `ORBIT_BASE_URL` does not match the address you typed. Fix it and restart Orbit.
- **The sign-in email did not arrive.** Check spam, and ask whoever runs your Orbit whether email is set up.
- **You signed in, but Claude says it is not connected.** Remove the connector and add it again.
