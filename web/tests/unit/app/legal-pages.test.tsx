import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataPolicyPage, { metadata as dataPolicyMetadata } from "@/app/data-policy/page";
import DisclaimerPage, { metadata as disclaimerMetadata } from "@/app/disclaimer/page";
import PrivacyPage, {
  dynamic as privacyDynamic,
  metadata as privacyMetadata,
} from "@/app/privacy/page";
import TermsPage, { dynamic as termsDynamic, metadata as termsMetadata } from "@/app/terms/page";
import { renderPlain } from "@/tests/unit/helpers/render";

afterEach(() => {
  vi.unstubAllEnvs();
});

function operatorEnvironment() {
  vi.stubEnv("ORBIT_OPERATOR_NAME", "Pat Example");
  vi.stubEnv("ORBIT_CONTACT_EMAIL", "pat@example.com");
  vi.stubEnv("ORBIT_DATA_LOCATION", "Railway, US East");
}

describe("data policy page", () => {
  it("shows the data policy under its own title", () => {
    renderPlain(<DataPolicyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Data policy" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "What Orbit stores" }),
    ).toBeInTheDocument();
    expect(dataPolicyMetadata.title).toBe("Data policy");
  });
});

describe("disclaimer page", () => {
  it("says plans are written by AI and are not advice", () => {
    renderPlain(<DisclaimerPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Disclaimer" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Plans and suggestions are written by AI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/is legal, financial, tax, medical, travel or other professional advice/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not affiliated with, sponsored by or endorsed by/),
    ).toBeInTheDocument();
    expect(disclaimerMetadata.title).toBe("Disclaimer");
  });
});

describe("privacy page", () => {
  it("shows who runs this Orbit, read from the environment", () => {
    operatorEnvironment();

    renderPlain(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Pat Example")).toBeInTheDocument();
    expect(screen.getByText("Railway, US East")).toBeInTheDocument();
    expect(privacyMetadata.title).toBe("Privacy");
  });

  it("names Aionyx Technologies when nothing is filled in", () => {
    vi.stubEnv("ORBIT_OPERATOR_NAME", "");
    vi.stubEnv("ORBIT_CONTACT_EMAIL", "");
    vi.stubEnv("ORBIT_DATA_LOCATION", "");

    renderPlain(<PrivacyPage />);

    expect(screen.getByText("Aionyx Technologies, Inc.")).toBeInTheDocument();
    expect(screen.queryByText(/has not added their details yet/)).not.toBeInTheDocument();
  });

  it("is rendered for each request so the settings are read at run time", () => {
    expect(privacyDynamic).toBe("force-dynamic");
  });
});

describe("terms page", () => {
  it("shows the terms with the operator at the end", () => {
    operatorEnvironment();

    renderPlain(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Contact us" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "pat@example.com" })).toBeInTheDocument();
    expect(termsMetadata.title).toBe("Terms");
  });

  it("is rendered for each request so the settings are read at run time", () => {
    expect(termsDynamic).toBe("force-dynamic");
  });
});
