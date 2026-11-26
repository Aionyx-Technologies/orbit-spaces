import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  apiBaseUrl,
  serverGet,
  serverGetOptional,
  serverGetOrDefault,
  serverRequest,
} from "@/lib/server-api";
import { makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, failFetch, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";

const next = vi.hoisted(() => ({
  cookieHeader: "orbit_session=abc",
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => next.cookieHeader }),
}));
vi.mock("next/navigation", () => ({ redirect: next.redirect, notFound: next.notFound }));

describe("server api", () => {
  beforeEach(() => {
    next.cookieHeader = "orbit_session=abc";
    vi.stubEnv("ORBIT_API_URL", "http://api.internal:8000/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the api address from the environment without a trailing slash", () => {
    expect(apiBaseUrl()).toBe("http://api.internal:8000");
  });

  it("falls back to localhost when unset or empty", () => {
    vi.stubEnv("ORBIT_API_URL", "");
    expect(apiBaseUrl()).toBe("http://localhost:8000");
    vi.stubEnv("ORBIT_API_URL", "   ");
    expect(apiBaseUrl()).toBe("http://localhost:8000");
    vi.unstubAllEnvs();
    delete process.env.ORBIT_API_URL;
    expect(apiBaseUrl()).toBe("http://localhost:8000");
  });

  it("forwards the visitor's cookie and never caches", async () => {
    const mock = mockFetch({ "GET http://api.internal:8000/api/me": jsonResponse(makeMe()) });

    const result = await serverRequest("/api/me");

    expect(result).toEqual({ ok: true, data: makeMe() });
    expect(mock.calls[0]?.headers).toMatchObject({
      cookie: "orbit_session=abc",
      accept: "application/json",
    });
    const options = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]?.[1];
    expect(options?.cache).toBe("no-store");
  });

  it("sends no cookie header when there is none", async () => {
    next.cookieHeader = "";
    const mock = mockFetch({ "GET http://api.internal:8000/api/me": jsonResponse(makeMe()) });

    await serverRequest("/api/me");

    expect(mock.calls[0]?.headers.cookie).toBeUndefined();
  });

  it("returns the error details for a failed request", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/invites/x": errorResponse(404, "invite_not_found", "Nope"),
    });

    await expect(serverRequest("/api/invites/x")).resolves.toEqual({
      ok: false,
      status: 404,
      code: "invite_not_found",
      message: "Nope",
    });
  });

  it("uses a generic message when the error body is unreadable", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/a": new Response("oops", { status: 502 }),
      "GET http://api.internal:8000/api/b": jsonResponse({ unexpected: true }, 500),
    });

    await expect(serverRequest("/api/a")).resolves.toMatchObject({ ok: false, status: 502 });
    await expect(serverRequest("/api/b")).resolves.toMatchObject({ ok: false, code: "error" });
  });

  it("throws a friendly error when the api cannot be reached", async () => {
    failFetch();
    await expect(serverRequest("/api/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns data for serverGet", async () => {
    mockFetch({ "GET http://api.internal:8000/api/me": jsonResponse(makeMe()) });
    await expect(serverGet("/api/me", "/spaces")).resolves.toEqual(makeMe());
  });

  it("redirects to sign in with the page to return to", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/me": errorResponse(401, "unauthenticated", "Sign in"),
    });

    await expect(serverGet("/api/me", "/spaces/a b")).rejects.toThrow(
      "REDIRECT:/auth/sign-in?next=%2Fspaces%2Fa%20b",
    );
  });

  it.each([403, 404])("shows not found for a %i", async (status) => {
    mockFetch({
      "GET http://api.internal:8000/api/spaces/x": errorResponse(status, "not_found", "Gone"),
    });

    await expect(serverGet("/api/spaces/x", "/spaces/x")).rejects.toThrow("NOT_FOUND");
  });

  it("throws an ApiError for other failures", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/me": errorResponse(500, "error", "Server trouble"),
    });

    await expect(serverGet("/api/me", "/spaces")).rejects.toMatchObject({
      status: 500,
      message: "Server trouble",
    });
  });

  it("falls back when the server does not know the path with serverGetOrDefault", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/invitations": errorResponse(404, "not_found", "No"),
    });

    await expect(
      serverGetOrDefault("/api/invitations", "/spaces", { invitations: [] }),
    ).resolves.toEqual({ invitations: [] });
  });

  it("returns real data, sends signed-out visitors to sign in and surfaces failures with serverGetOrDefault", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/invitations": jsonResponse({ invitations: [1] }),
      "GET http://api.internal:8000/api/private": errorResponse(401, "unauthenticated", "Sign in"),
      "GET http://api.internal:8000/api/broken": errorResponse(500, "error", "Bad"),
    });

    await expect(serverGetOrDefault("/api/invitations", "/spaces", {})).resolves.toEqual({
      invitations: [1],
    });
    await expect(serverGetOrDefault("/api/private", "/spaces", {})).rejects.toThrow(
      "REDIRECT:/auth/sign-in?next=%2Fspaces",
    );
    await expect(serverGetOrDefault("/api/broken", "/spaces", {})).rejects.toBeInstanceOf(ApiError);
  });

  it("returns null for a signed-out visitor with serverGetOptional", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/me": errorResponse(401, "unauthenticated", "Sign in"),
    });

    await expect(serverGetOptional("/api/me")).resolves.toBeNull();
  });

  it("returns data when signed in and throws on real failures with serverGetOptional", async () => {
    mockFetch({
      "GET http://api.internal:8000/api/me": jsonResponse(makeMe()),
      "GET http://api.internal:8000/api/broken": errorResponse(500, "error", "Bad"),
    });

    await expect(serverGetOptional("/api/me")).resolves.toEqual(makeMe());
    await expect(serverGetOptional("/api/broken")).rejects.toBeInstanceOf(ApiError);
  });
});
