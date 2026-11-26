import type { OperatorEnvironment } from "@/lib/operator.types";

type HeaderReader = { get(name: string): string | null };

const FALLBACK = "http://localhost:3000";
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function parsed(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The public address of this Orbit, for absolute links in shared-link previews.
 * Uses ORBIT_BASE_URL when it is set, otherwise the host the proxy forwarded.
 */
export function siteUrl(environment: OperatorEnvironment, requestHeaders: HeaderReader): URL {
  const configured = parsed(environment.ORBIT_BASE_URL);
  if (configured) return new URL(configured.origin);
  const host = firstValue(requestHeaders.get("x-forwarded-host")) ?? requestHeaders.get("host");
  if (!host || !HOST.test(host)) return new URL(FALLBACK);
  const forwarded = firstValue(requestHeaders.get("x-forwarded-proto"));
  const local = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
  const protocol =
    forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return new URL(`${protocol}://${host}`);
}
