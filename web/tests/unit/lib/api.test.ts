import { describe, expect, it } from "vitest";

import {
  api,
  ApiError,
  describeError,
  fetcher,
  GENERIC_MESSAGE,
  isUnauthenticated,
  itemsKey,
  NETWORK_MESSAGE,
  signInUrl,
  spaceKey,
} from "@/lib/api";
import {
  makeItem,
  makeItemsPage,
  makeMe,
  makeTemplate,
  templateInputOf,
} from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  failFetch,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";

describe("requests", () => {
  it("sends JSON bodies with the right headers on the same origin", async () => {
    const mock = mockFetch({ "POST /api/spaces": jsonResponse({ id: "s1" }, 201) });

    await api.spaces.create("Goa trip");

    const [call] = mock.calls;
    expect(call?.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
    });
    expect(call?.json).toEqual({ name: "Goa trip" });
    const options = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]?.[1];
    expect(options?.credentials).toBe("same-origin");
    expect(options?.cache).toBe("no-store");
  });

  it("sends form bodies for the sign-in helpers", async () => {
    const mock = mockFetch({ "POST /auth/sign-in": jsonResponse({ status: "sent" }) });

    const result = await api.auth.signIn({
      email: "a@example.com",
      next: "/invite/t",
      invite: "t",
    });

    expect(result).toEqual({ status: "sent" });
    expect(mock.calls[0]?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(mock.calls[0]?.headers.accept).toBe("application/json");
    expect(new URLSearchParams(mock.calls[0]?.body ?? "").get("invite")).toBe("t");
    expect(new URLSearchParams(mock.calls[0]?.body ?? "").get("next")).toBe("/invite/t");
  });

  it("uploads a photo as multipart form data in a field named file, without a fixed content type", async () => {
    const mock = mockFetch({ "POST /api/me/avatar": jsonResponse(makeMe()) });
    const photo = new Blob(["pixels"], { type: "image/png" });

    await api.me.uploadAvatar(photo, "photo.png");

    const call = mock.calls[0];
    expect(call?.headers["content-type"]).toBeUndefined();
    expect(call?.headers.accept).toBe("application/json");
    const sent = call?.formData?.get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("photo.png");
    expect((sent as File).type).toBe("image/png");
    expect(call?.formData?.getAll("file")).toHaveLength(1);
  });

  it("sends only the profile fields that changed, including a cleared default space", async () => {
    const mock = mockFetch({ "PATCH /api/me": jsonResponse(makeMe()) });

    await api.me.update({ about: "Likes trains", time_zone: "Asia/Kolkata" });
    await api.me.update({ email_frequency: "daily", default_space_id: null });

    expect(mock.calls[0]?.json).toEqual({ about: "Likes trains", time_zone: "Asia/Kolkata" });
    expect(mock.calls[1]?.json).toEqual({ email_frequency: "daily", default_space_id: null });
  });

  it("removes a photo and returns the updated person", async () => {
    mockFetch({ "DELETE /api/me/avatar": jsonResponse(makeMe({ avatar_url: null })) });

    await expect(api.me.removeAvatar()).resolves.toMatchObject({ avatar_url: null });
  });

  it("signs out everywhere with no body and no response to read", async () => {
    const mock = mockFetch({ "POST /api/me/sessions/revoke-all": emptyResponse() });

    await expect(api.me.signOutEverywhere()).resolves.toBeUndefined();

    expect(mock.calls[0]?.body).toBeNull();
  });

  it("posts the waitlist email and signs out with an optional next", async () => {
    const mock = mockFetch({
      "POST /auth/waitlist": jsonResponse({ status: "joined" }),
      "POST /auth/sign-out": jsonResponse({ status: "signed_out" }),
    });

    await api.auth.waitlist("w@example.com");
    await api.auth.signOut();
    await api.auth.signOut("/spaces");

    expect(mock.calls[0]?.body).toBe("email=w%40example.com");
    expect(mock.calls[1]?.body).toBe("");
    expect(mock.calls[2]?.body).toBe("next=%2Fspaces");
  });

  it("returns undefined for empty responses", async () => {
    mockFetch({ "DELETE /api/items/item-1": emptyResponse() });
    await expect(api.items.retract("item-1")).resolves.toBeUndefined();
  });

  it("builds every endpoint path", async () => {
    const mock = mockFetch({
      "GET /api/me": jsonResponse(makeMe()),
      "PATCH /api/me": jsonResponse(makeMe()),
      "DELETE /api/me": emptyResponse(),
      "POST /api/me/avatar": jsonResponse(makeMe()),
      "DELETE /api/me/avatar": jsonResponse(makeMe()),
      "POST /api/me/sessions/revoke-all": emptyResponse(),
      "GET /api/spaces": jsonResponse({ spaces: [] }),
      "GET /api/spaces/s%201": jsonResponse({}),
      "DELETE /api/spaces/s%201": emptyResponse(),
      "PATCH /api/spaces/s%201/membership": jsonResponse({ notify_email: false }),
      "POST /api/spaces/s%201/items": jsonResponse(makeItem(), 201),
      "PUT /api/spaces/s%201/memory": jsonResponse({}),
      "POST /api/spaces/s%201/combine": jsonResponse({}),
      "POST /api/spaces/s%201/invites": jsonResponse({}, 201),
      "GET /api/invites/tok%2Fen": jsonResponse({}),
      "POST /api/invites/tok%2Fen/accept": jsonResponse({}),
      "GET /api/connections": jsonResponse({ connections: [] }),
      "DELETE /api/connections/c1": emptyResponse(),
    });

    await api.me.get();
    await api.me.update({ display_name: "Alex" });
    await api.me.uploadAvatar(new Blob(["x"], { type: "image/png" }), "photo.png");
    await api.me.removeAvatar();
    await api.me.signOutEverywhere();
    await api.me.remove();
    await api.spaces.list();
    await api.spaces.get("s 1");
    await api.spaces.remove("s 1");
    await api.spaces.setNotify("s 1", false);
    await api.items.share("s 1", { title: "t", content: "c" });
    await api.memory.set("s 1", { key: "k", value: "v" });
    await api.combine.run("s 1");
    await api.invites.create("s 1", "  ");
    await api.invites.view("tok/en");
    await api.invites.accept("tok/en");
    await api.connections.list();
    await api.connections.revoke("c1");

    expect(mock.calls).toHaveLength(18);
    expect(mock.calls[1]?.json).toEqual({ display_name: "Alex" });
    expect(mock.calls[9]?.json).toEqual({ notify_email: false });
    expect(mock.calls[12]?.json).toEqual({ instruction: null });
    expect(mock.calls[13]?.json).toEqual({ email: null });
  });

  it("marks a space read with a POST to its read path", async () => {
    const mock = mockFetch({ "POST /api/spaces/s%201/read": emptyResponse() });

    await api.spaces.markRead("s 1");

    expect(mock.callsTo("POST", "/api/spaces/s%201/read")).toHaveLength(1);
  });

  it("creates a space from a built-in template id or a full template, never both", async () => {
    const mock = mockFetch({ "POST /api/spaces": jsonResponse({ id: "s1" }, 201) });
    const custom = {
      name: "Wedding",
      description: "",
      facts: [],
      plan_sections: ["To settle"],
      combine_hint: "",
      tips: [],
    };

    await api.spaces.create("Trip", { template_id: "trip" });
    await api.spaces.create("Day", { template: custom });

    expect(mock.calls[0]?.json).toEqual({ name: "Trip", template_id: "trip" });
    expect(mock.calls[1]?.json).toEqual({ name: "Day", template: custom });
  });

  it("lists built-in templates, drafts one from a purpose and replaces a space template", async () => {
    const mock = mockFetch({
      "GET /api/templates": jsonResponse({ templates: [makeTemplate()] }),
      "POST /api/templates/draft": jsonResponse({ template: makeTemplate(), drafted: true }),
      "PUT /api/spaces/s%201/template": jsonResponse(makeTemplate()),
    });
    const input = templateInputOf(makeTemplate());

    const listed = await api.templates.list();
    const drafted = await api.templates.draft("A wedding");
    const saved = await api.spaces.setTemplate("s 1", input);

    expect(listed.templates).toHaveLength(1);
    expect(drafted.drafted).toBe(true);
    expect(saved.id).toBe("general");
    expect(mock.calls[1]?.json).toEqual({ purpose: "A wedding" });
    expect(mock.calls[2]?.json).toEqual(input);
  });

  it("lists, accepts and declines invitations by id, encoding the id", async () => {
    const mock = mockFetch({
      "GET /api/invitations": jsonResponse({ invitations: [] }),
      "POST /api/invitations/id%2F1/accept": jsonResponse({
        space_id: "s1",
        already_member: false,
      }),
      "POST /api/invitations/id%2F1/decline": emptyResponse(),
    });

    expect(await api.invitations.list()).toEqual({ invitations: [] });
    expect(await api.invitations.accept("id/1")).toEqual({ space_id: "s1", already_member: false });
    await expect(api.invitations.decline("id/1")).resolves.toBeUndefined();

    expect(mock.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/invitations",
      "POST /api/invitations/id%2F1/accept",
      "POST /api/invitations/id%2F1/decline",
    ]);
  });

  it("trims the invite email", async () => {
    const mock = mockFetch({ "POST /api/spaces/s1/invites": jsonResponse({}, 201) });
    await api.invites.create("s1", " blake@example.com ");
    expect(mock.calls[0]?.json).toEqual({ email: "blake@example.com" });
  });

  it("passes the combine instruction through", async () => {
    const mock = mockFetch({ "POST /api/spaces/s1/combine": jsonResponse({}) });
    await api.combine.run("s1", "focus on budget");
    expect(mock.calls[0]?.json).toEqual({ instruction: "focus on budget" });
  });

  it("pages the feed with a cursor and limit", async () => {
    const mock = mockFetch({
      "GET /api/spaces/s1/items?limit=20&before=i9": jsonResponse(makeItemsPage()),
      "GET /api/spaces/s1/items": jsonResponse(makeItemsPage()),
    });
    await api.items.list("s1", { before: "i9", limit: 20 });
    await api.items.list("s1");
    expect(mock.calls.map((call) => call.url)).toEqual([
      "/api/spaces/s1/items?limit=20&before=i9",
      "/api/spaces/s1/items",
    ]);
  });

  it("fetches by key for SWR", async () => {
    mockFetch({ "GET /api/me": jsonResponse(makeMe()) });
    await expect(fetcher("/api/me")).resolves.toMatchObject({ display_name: "Alex" });
  });
});

describe("errors", () => {
  it("turns the standard error body into an ApiError", async () => {
    mockFetch({ "GET /api/me": errorResponse(403, "not_a_member", "You are not a member.") });

    const failure = await api.me.get().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 403,
      code: "not_a_member",
      message: "You are not a member.",
      name: "ApiError",
    });
  });

  it("uses a generic message when the body is not the standard shape", async () => {
    mockFetch({
      "GET /api/me": new Response("<html>Bad gateway</html>", { status: 502 }),
      "GET /api/spaces": jsonResponse({ detail: "nope" }, 500),
    });

    await expect(api.me.get()).rejects.toMatchObject({ status: 502, message: GENERIC_MESSAGE });
    await expect(api.spaces.list()).rejects.toMatchObject({ status: 500, code: "error" });
  });

  it("reports a network failure in plain words", async () => {
    failFetch();
    await expect(api.me.get()).rejects.toMatchObject({
      status: 0,
      code: "network",
      message: NETWORK_MESSAGE,
    });
  });

  it("recognises unauthenticated errors", () => {
    expect(isUnauthenticated(new ApiError(401, "unauthenticated", "Sign in"))).toBe(true);
    expect(isUnauthenticated(new ApiError(403, "forbidden", "No"))).toBe(false);
    expect(isUnauthenticated(new Error("x"))).toBe(false);
    expect(isUnauthenticated(null)).toBe(false);
  });

  it("describes errors for people", () => {
    expect(describeError(new ApiError(422, "invalid_input", "Title cannot be empty."))).toBe(
      "Title cannot be empty.",
    );
    expect(describeError(new Error("boom"))).toBe(GENERIC_MESSAGE);
    expect(describeError("odd", "Custom fallback")).toBe("Custom fallback");
  });
});

describe("paths", () => {
  it("builds the sign-in URL with an encoded next path", () => {
    expect(signInUrl("/spaces/a b?x=1")).toBe("/auth/sign-in?next=%2Fspaces%2Fa%20b%3Fx%3D1");
  });

  it("builds space and feed keys", () => {
    expect(spaceKey("s 1")).toBe("/api/spaces/s%201");
    expect(itemsKey("s1", { limit: 5 })).toBe("/api/spaces/s1/items?limit=5");
    expect(itemsKey("s1", { before: null })).toBe("/api/spaces/s1/items");
  });
});

describe("space suggestions", () => {
  it("posts the purpose to the suggest endpoint", async () => {
    const suggestion = {
      suggested: true,
      name: "Goa trip",
      template: makeTemplate({ id: "trip", icon: "plane" }),
      base_template_id: "trip",
      facts: [{ key: "Dates", value: "May" }],
    };
    const mock = mockFetch({ "POST /api/spaces/suggest": jsonResponse(suggestion) });

    const result = await api.spaces.suggest("a trip to Goa");

    expect(mock.calls[0]?.json).toEqual({ purpose: "a trip to Goa" });
    expect(result).toEqual(suggestion);
  });

  it("sends facts on create when there are some", async () => {
    const mock = mockFetch({ "POST /api/spaces": jsonResponse({ id: "s1" }, 201) });
    const facts = [{ key: "Dates", value: "May", suggested: true }];

    await api.spaces.create("Goa trip", { template_id: "trip" }, facts);

    expect(mock.calls[0]?.json).toEqual({ name: "Goa trip", template_id: "trip", facts });
  });

  it("sends no facts key when facts are empty or missing", async () => {
    const mock = mockFetch({ "POST /api/spaces": jsonResponse({ id: "s1" }, 201) });

    await api.spaces.create("A", { template_id: "trip" }, []);
    await api.spaces.create("B", { template_id: "trip" });

    expect(mock.calls[0]?.json).toEqual({ name: "A", template_id: "trip" });
    expect(mock.calls[1]?.json).toEqual({ name: "B", template_id: "trip" });
  });
});
