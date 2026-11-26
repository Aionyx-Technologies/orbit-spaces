import { afterEach, describe, expect, it, vi } from "vitest";

import {
  browserTimeZone,
  buildZoneList,
  knownTimeZones,
  modernZoneName,
  serverTimeZones,
  timeZoneLabel,
  zoneOptions,
  zoneToSuggest,
} from "@/lib/time-zones";

describe("browserTimeZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the zone the browser uses", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return { resolvedOptions: () => ({ timeZone: "Asia/Kolkata" }) } as Intl.DateTimeFormat;
    });

    expect(browserTimeZone()).toBe("Asia/Kolkata");
  });

  it.each([
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
  ])("gives the current name when the browser reports the old one, %s", (reported, expected) => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return { resolvedOptions: () => ({ timeZone: reported }) } as Intl.DateTimeFormat;
    });

    expect(browserTimeZone()).toBe(expected);
  });

  it("returns nothing when the browser gives an empty zone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return { resolvedOptions: () => ({ timeZone: "" }) } as Intl.DateTimeFormat;
    });

    expect(browserTimeZone()).toBeNull();
  });

  it("returns nothing when the browser cannot say", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      throw new RangeError("no zone");
    });

    expect(browserTimeZone()).toBeNull();
  });
});

describe("knownTimeZones", () => {
  it("lists UTC first and then the zones the browser knows, with no repeats", () => {
    const zones = knownTimeZones();

    expect(zones[0]).toBe("UTC");
    expect(zones.filter((zone) => zone === "UTC")).toHaveLength(1);
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("America/New_York");
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("hands back the same list each time, so it can be read like a store", () => {
    expect(knownTimeZones()).toBe(knownTimeZones());
  });
});

describe("modernZoneName", () => {
  it.each([
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Asia/Katmandu", "Asia/Kathmandu"],
    ["Asia/Rangoon", "Asia/Yangon"],
    ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["America/Godthab", "America/Nuuk"],
    ["Atlantic/Faeroe", "Atlantic/Faroe"],
    ["Pacific/Truk", "Pacific/Chuuk"],
  ])("swaps the old name %s for %s, which every server's tz database knows", (old, current) => {
    expect(modernZoneName(old)).toBe(current);
  });

  it("leaves current names alone", () => {
    for (const zone of ["Asia/Kolkata", "Europe/London", "America/New_York", "UTC"]) {
      expect(modernZoneName(zone)).toBe(zone);
    }
  });
});

describe("buildZoneList", () => {
  it("puts UTC first, uses current names and drops repeats", () => {
    const list = buildZoneList([
      "Asia/Calcutta",
      "Asia/Kolkata",
      "Europe/Kiev",
      "UTC",
      "Europe/Paris",
    ]);

    expect(list).toEqual(["UTC", "Asia/Kolkata", "Europe/Kyiv", "Europe/Paris"]);
  });

  it("never offers a name that is on the old-name list", () => {
    const list = knownTimeZones();

    for (const old of ["Asia/Calcutta", "Europe/Kiev", "Asia/Saigon", "America/Buenos_Aires"]) {
      expect(list).not.toContain(old);
    }
  });
});

describe("serverTimeZones", () => {
  it("is empty and stable, because the server does not know the browser's list", () => {
    expect(serverTimeZones()).toEqual([]);
    expect(serverTimeZones()).toBe(serverTimeZones());
  });
});

describe("zoneOptions", () => {
  it("returns the list unchanged when the chosen zone is in it", () => {
    const zones = ["UTC", "Asia/Kolkata"];

    expect(zoneOptions(zones, "Asia/Kolkata")).toBe(zones);
  });

  it("adds the chosen zone at the top when the list does not have it", () => {
    expect(zoneOptions(["UTC", "Asia/Kolkata"], "Asia/Calcutta")).toEqual([
      "Asia/Calcutta",
      "UTC",
      "Asia/Kolkata",
    ]);
  });

  it("still offers the chosen zone before the list is known", () => {
    expect(zoneOptions([], "UTC")).toEqual(["UTC"]);
  });
});

describe("timeZoneLabel", () => {
  it("swaps underscores for spaces", () => {
    expect(timeZoneLabel("America/New_York")).toBe("America/New York");
    expect(timeZoneLabel("UTC")).toBe("UTC");
  });
});

describe("zoneToSuggest", () => {
  it("suggests the browser's zone while the saved one is still the UTC default", () => {
    expect(zoneToSuggest("UTC", "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("never replaces a zone the person already has", () => {
    expect(zoneToSuggest("Europe/Paris", "Asia/Kolkata")).toBeNull();
  });

  it("suggests nothing when the browser is on UTC or does not say", () => {
    expect(zoneToSuggest("UTC", "UTC")).toBeNull();
    expect(zoneToSuggest("UTC", null)).toBeNull();
  });
});
