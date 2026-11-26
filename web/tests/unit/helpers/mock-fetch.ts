import { vi } from "vitest";

import type { FetchMock, RecordedCall, Routes } from "@/tests/unit/helpers/mock-fetch.types";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function readHeaders(init: RequestInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  const headers = init?.headers;
  if (headers && !Array.isArray(headers) && !(headers instanceof Headers)) {
    for (const [name, value] of Object.entries(headers)) {
      result[name.toLowerCase()] = String(value);
    }
  }
  return result;
}

function readBody(init: RequestInit | undefined): string | null {
  const body = init?.body;
  if (body === undefined || body === null) {
    return null;
  }
  if (body instanceof FormData) {
    return null;
  }
  return body instanceof URLSearchParams ? body.toString() : String(body);
}

function parseJson(body: string | null, headers: Record<string, string>): unknown {
  if (body === null || !headers["content-type"]?.includes("application/json")) {
    return undefined;
  }
  return JSON.parse(body);
}

export function mockFetch(routes: Routes): FetchMock {
  const calls: RecordedCall[] = [];
  const implementation = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = String(input);
    const headers = readHeaders(init);
    const body = readBody(init);
    const formData = init?.body instanceof FormData ? init.body : null;
    const call: RecordedCall = {
      method,
      url,
      headers,
      body,
      json: parseJson(body, headers),
      formData,
    };
    calls.push(call);
    const route = routes[`${method} ${url}`];
    if (route === undefined) {
      throw new Error(`No mocked route for ${method} ${url}`);
    }
    return typeof route === "function" ? route(call) : route.clone();
  };
  vi.stubGlobal("fetch", vi.fn(implementation));
  return {
    calls,
    callsTo: (method, url) =>
      calls.filter((call) => call.method === method.toUpperCase() && call.url === url),
  };
}

export function failFetch(message = "network down"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError(message);
    }),
  );
}
