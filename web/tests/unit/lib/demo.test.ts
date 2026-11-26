import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { DEMO_OFF, readDemo } from "@/lib/demo";

const serverApi = vi.hoisted(() => ({ serverRequest: vi.fn() }));

vi.mock("@/lib/server-api", () => serverApi);

const PEOPLE = [
  { key: "alex", name: "Alex" },
  { key: "blake", name: "Blake" },
];

beforeEach(() => {
  serverApi.serverRequest.mockReset();
});

describe("readDemo", () => {
  it("returns the people when demo mode is on", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: true,
      data: { enabled: true, people: PEOPLE },
    });

    expect(await readDemo()).toEqual({ enabled: true, people: PEOPLE });
    expect(serverApi.serverRequest).toHaveBeenCalledWith("/api/demo");
  });

  it("says it is off when the server says so", async () => {
    serverApi.serverRequest.mockResolvedValue({ ok: true, data: { enabled: false, people: [] } });

    expect(await readDemo()).toBe(DEMO_OFF);
  });

  it("never offers the demo when the answer is an error", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: false,
      status: 500,
      code: "server_error",
      message: "Something went wrong on our side.",
    });

    expect(await readDemo()).toBe(DEMO_OFF);
  });

  it("never offers the demo when the server cannot be reached", async () => {
    serverApi.serverRequest.mockRejectedValue(
      new ApiError(0, "network", "Orbit can't be reached."),
    );

    expect(await readDemo()).toBe(DEMO_OFF);
  });

  it("ignores people when the server says demo mode is off", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: true,
      data: { enabled: false, people: PEOPLE },
    });

    expect(await readDemo()).toEqual({ enabled: false, people: [] });
  });
});
