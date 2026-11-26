import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { readBillingEnabled } from "@/lib/billing-public";

const serverApi = vi.hoisted(() => ({ serverRequest: vi.fn() }));

vi.mock("@/lib/server-api", () => serverApi);

beforeEach(() => {
  serverApi.serverRequest.mockReset();
});

describe("readBillingEnabled", () => {
  it("is true when the server says billing is on", async () => {
    serverApi.serverRequest.mockResolvedValue({ ok: true, data: { enabled: true } });

    expect(await readBillingEnabled()).toBe(true);
    expect(serverApi.serverRequest).toHaveBeenCalledWith("/api/billing/public");
  });

  it("is false when the server says billing is off", async () => {
    serverApi.serverRequest.mockResolvedValue({ ok: true, data: { enabled: false } });

    expect(await readBillingEnabled()).toBe(false);
  });

  it("is false when the answer is an error", async () => {
    serverApi.serverRequest.mockResolvedValue({
      ok: false,
      status: 500,
      code: "server_error",
      message: "Something went wrong on our side.",
    });

    expect(await readBillingEnabled()).toBe(false);
  });

  it("is false when the server cannot be reached", async () => {
    serverApi.serverRequest.mockRejectedValue(
      new ApiError(0, "network", "Orbit can't be reached."),
    );

    expect(await readBillingEnabled()).toBe(false);
  });
});
