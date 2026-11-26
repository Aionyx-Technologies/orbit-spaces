import { describe, expect, it } from "vitest";

import { siteUrl } from "@/lib/site-url";

function headersOf(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("siteUrl", () => {
  it("prefers the configured public address", () => {
    const url = siteUrl(
      { ORBIT_BASE_URL: " https://orbit.example.com/ " },
      headersOf({ host: "web:3000" }),
    );

    expect(url.origin).toBe("https://orbit.example.com");
  });

  it("falls back to the address the proxy forwarded", () => {
    const url = siteUrl(
      {},
      headersOf({
        host: "web:3000",
        "x-forwarded-host": "orbit.example.com, proxy.internal",
        "x-forwarded-proto": "https",
      }),
    );

    expect(url.origin).toBe("https://orbit.example.com");
  });

  it("uses the Host header and assumes https away from localhost", () => {
    expect(siteUrl({}, headersOf({ host: "orbit.example.com" })).origin).toBe(
      "https://orbit.example.com",
    );
    expect(siteUrl({}, headersOf({ host: "localhost:3000" })).origin).toBe("http://localhost:3000");
  });

  it("ignores a malformed host or protocol", () => {
    const url = siteUrl(
      { ORBIT_BASE_URL: "not a url" },
      headersOf({ host: "evil.example/<script>", "x-forwarded-proto": "javascript" }),
    );

    expect(url.origin).toBe("http://localhost:3000");
  });
});
