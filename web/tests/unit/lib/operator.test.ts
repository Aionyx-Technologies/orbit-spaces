import { describe, expect, it } from "vitest";

import { hasOperatorDetails, readOperatorDetails } from "@/lib/operator";

describe("readOperatorDetails", () => {
  it("reads the three settings the operator can provide", () => {
    const details = readOperatorDetails({
      ORBIT_OPERATOR_NAME: "Pat Example",
      ORBIT_CONTACT_EMAIL: "pat@example.com",
      ORBIT_DATA_LOCATION: "Railway, US East",
    });

    expect(details).toEqual({
      name: "Pat Example",
      contact: "pat@example.com",
      dataLocation: "Railway, US East",
    });
  });

  it("trims whitespace and treats blank values as missing", () => {
    const details = readOperatorDetails({
      ORBIT_OPERATOR_NAME: "  Pat Example  ",
      ORBIT_CONTACT_EMAIL: "   ",
      ORBIT_DATA_LOCATION: "",
    });

    expect(details).toEqual({
      name: "Pat Example",
      contact: "hello@orbitspaces.ai",
      dataLocation: null,
    });
  });

  it("falls back to Aionyx Technologies when no setting is present", () => {
    expect(readOperatorDetails({})).toEqual({
      name: "Aionyx Technologies, Inc.",
      contact: "hello@orbitspaces.ai",
      dataLocation: null,
    });
  });

  it("reads the real environment when none is given", () => {
    const details = readOperatorDetails();

    expect(Object.keys(details).sort()).toEqual(["contact", "dataLocation", "name"]);
  });
});

describe("hasOperatorDetails", () => {
  it("is false only when every detail is missing", () => {
    expect(hasOperatorDetails({ name: null, contact: null, dataLocation: null })).toBe(false);
    expect(hasOperatorDetails({ name: "Pat", contact: null, dataLocation: null })).toBe(true);
    expect(hasOperatorDetails({ name: null, contact: "pat@example.com", dataLocation: null })).toBe(
      true,
    );
    expect(hasOperatorDetails({ name: null, contact: null, dataLocation: "Here" })).toBe(true);
  });
});
