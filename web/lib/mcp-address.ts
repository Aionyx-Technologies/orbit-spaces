import { serverRequest } from "@/lib/server-api";

type ProtectedResource = Readonly<{ resource?: unknown }>;

/*
 * This server's connector address, read from the API's public OAuth metadata
 * so a signed-out visitor sees the same address the Assistants tab shows.
 * Returns null when the API cannot be reached, and the page then leaves the
 * setup prompt out rather than offering a wrong address.
 */
export async function readMcpUrl(): Promise<string | null> {
  try {
    const result = await serverRequest<ProtectedResource>(
      "/.well-known/oauth-protected-resource/mcp",
    );
    return result.ok && typeof result.data.resource === "string" ? result.data.resource : null;
  } catch {
    return null;
  }
}
