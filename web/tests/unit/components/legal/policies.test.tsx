import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataPolicyContent } from "@/components/legal/data-policy-content";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { TermsContent } from "@/components/legal/terms-content";
import { renderPlain } from "@/tests/unit/helpers/render";

const OPERATOR = {
  name: "Pat Example",
  contact: "pat@example.com",
  dataLocation: "Railway, US East",
};
const NOBODY = { name: null, contact: null, dataLocation: null };

function sectionTitles(): (string | null)[] {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

describe("DataPolicyContent", () => {
  it("covers each topic under its own heading", () => {
    renderPlain(<DataPolicyContent />);

    expect(sectionTitles()).toEqual([
      "What Orbit stores",
      "What Orbit does not store",
      "Who can read what you share",
      "What leaves the server",
      "How long it is kept",
      "Your controls",
      "Cookies",
      "Security",
      "Questions",
    ]);
  });

  it("says that secrets are stored scrambled and that nothing private reaches logs", () => {
    renderPlain(<DataPolicyContent />);

    expect(screen.getByText(/stored only as scrambled values/)).toBeInTheDocument();
    expect(
      screen.getByText(/never contain notes, facts, access keys or sign-in links/),
    ).toBeInTheDocument();
  });

  it("is straight about the operator being able to read the database", () => {
    renderPlain(<DataPolicyContent />);

    expect(screen.getByText(/can read the database and its backups/)).toBeInTheDocument();
  });

  it("is straight about what cannot be removed one by one", () => {
    renderPlain(<DataPolicyContent />);

    expect(screen.getByText(/cannot be retracted one by one/)).toBeInTheDocument();
    expect(screen.getByText(/can be changed but not deleted one by one/)).toBeInTheDocument();
  });

  it("names both cookies, says what the second one holds, and says there is no tracking", () => {
    renderPlain(<DataPolicyContent />);

    expect(screen.getByText("orbit_session")).toBeInTheDocument();
    expect(screen.getByText("orbit-theme")).toBeInTheDocument();
    expect(screen.getByText(/holds nothing but that word/)).toBeInTheDocument();
    expect(
      screen.getByText(/no analytics, advertising or third-party cookies/),
    ).toBeInTheDocument();
  });

  it("sends questions to the privacy page", () => {
    renderPlain(<DataPolicyContent />);

    const links = screen.getAllByRole("link", { name: "privacy page" });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute("href", "/privacy"));
  });

  it("says Stripe handles payments, that card details never reach Orbit and what is kept", () => {
    renderPlain(<DataPolicyContent />);

    expect(screen.getAllByText(/If this server takes payments/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/never reach Orbit/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Stripe customer id,\s+subscription id, plan, status/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/payment reference/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/never includes Stripe ids/).length).toBeGreaterThan(0);
  });

  it("says deleting the account asks Stripe, without claiming certainty", () => {
    renderPlain(<DataPolicyContent />);

    expect(
      screen.getAllByText(/asks Stripe to cancel your subscription and remove your Stripe customer/)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stripe cannot be reached/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deletion is refused/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stripe keeps its own records/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/cancels your subscription/);
  });

  it("avoids jargon", () => {
    renderPlain(<DataPolicyContent />);

    expect(document.body.textContent).not.toMatch(/MCP|OAuth|connector|token|hash/i);
  });
});

describe("PrivacyContent", () => {
  it("covers each topic under its own heading", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(sectionTitles()).toEqual([
      "Who runs Orbit",
      "What is collected, and why",
      "How we use it",
      "Who else receives it",
      "Where your data is stored",
      "How long we keep it",
      "Keeping it safe",
      "Your choices and rights",
      "Children",
      "Cookies",
      "Changes",
      "Contact",
    ]);
  });

  it("names Aionyx Technologies and how to reach it", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(
      screen.getByText(/Orbit is a product of Aionyx Technologies, Inc\./),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "privacy@orbitspaces.ai" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/do not sell or rent your information/)).toBeInTheDocument();
  });

  it("shows who runs this Orbit and where the data is", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(screen.getByText("Pat Example")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "pat@example.com" })).toBeInTheDocument();
    expect(screen.getByText("Railway, US East")).toBeInTheDocument();
  });

  it("warns that the operator has not said who they are when nothing is configured", () => {
    renderPlain(<PrivacyContent details={NOBODY} />);

    expect(screen.getByText(/has not added their details yet/)).toBeInTheDocument();
  });

  it("links to the data policy for the details", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    screen
      .getAllByRole("link", { name: /data policy/ })
      .forEach((link) => expect(link).toHaveAttribute("href", "/data-policy"));
  });

  it("says what the sign-in cookie and the theme cookie are for, and that there is no tracking", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(screen.getByText(/One cookie keeps you signed in/)).toBeInTheDocument();
    expect(
      screen.getByText(/remembers your light or dark theme if you choose one/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no\s+analytics, advertising or third-party cookies/),
    ).toBeInTheDocument();
  });

  it("says backups can keep deleted data for a while", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(screen.getByText(/can remain in a backup for that long/)).toBeInTheDocument();
  });

  it("names Stripe as a payment processor and says card details never reach Orbit", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(screen.getByText(/Stripe processes payments for us/)).toBeInTheDocument();
    expect(screen.getByText(/never reach Orbit/)).toBeInTheDocument();
    expect(screen.getByText(/asks Stripe to cancel your subscription/)).toBeInTheDocument();
    expect(screen.getByText(/payment reference/)).toBeInTheDocument();
    expect(screen.getByText(/deletion is refused/)).toBeInTheDocument();
  });

  it("avoids jargon", () => {
    renderPlain(<PrivacyContent details={OPERATOR} />);

    expect(document.body.textContent).not.toMatch(/MCP|OAuth|connector|token|hash/i);
  });
});

describe("TermsContent", () => {
  it("covers each topic under its own heading", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(sectionTitles()).toEqual([
      "What Orbit is",
      "Who can use it",
      "What you share",
      "Plans written by Orbit",
      "Your assistants and other services",
      "Using it fairly",
      "Open-source software",
      "Price",
      "Paid plans",
      "Changes to the service",
      "Ending",
      "No warranty",
      "Limits on our responsibility",
      "Your responsibility",
      "Law and disputes",
      "Changes to these terms",
      "The rest",
      "Contact us",
    ]);
  });

  it("is an agreement with Aionyx Technologies under Delaware law", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(
      screen.getByText(/agreement between you and Aionyx Technologies, Inc\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/laws of the State of Delaware/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/private test/);
  });

  it("says the code is AGPL-3.0-only and links to the source", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(
      screen.getByText(/GNU Affero General Public License v3\.0[\s\S]*AGPL-3\.0-only/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "github.com/Aionyx-Technologies/orbit-spaces" }),
    ).toHaveAttribute("href", "https://github.com/Aionyx-Technologies/orbit-spaces");
    expect(document.body.textContent).not.toMatch(/Apache/);
  });

  it("warns that plans can be wrong and are not advice", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(screen.getByText(/can be wrong, incomplete or miss context/)).toBeInTheDocument();
    expect(screen.getByText(/not professional advice/)).toBeInTheDocument();
  });

  it("tells people to keep ownership but not to share secrets", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(screen.getByText("You keep ownership of what you share.")).toBeInTheDocument();
    expect(screen.getByText(/Do not share passwords, secrets/)).toBeInTheDocument();
  });

  it("ends with who to ask", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(screen.getByText("Pat Example")).toBeInTheDocument();
  });

  it("explains paid plans conditionally: Stripe, joining is free, cancelling, 12-month packs", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(screen.getByText(/If this server takes payments/)).toBeInTheDocument();
    expect(screen.getByText(/Joining a space is always free/)).toBeInTheDocument();
    expect(
      screen.getByText(/keep Plus until the end of the period you paid for/),
    ).toBeInTheDocument();
    expect(screen.getByText(/valid for 12 months/)).toBeInTheDocument();
    expect(
      screen.getByText(/full refund removes the credits you have not used/),
    ).toBeInTheDocument();
    expect(screen.getByText(/never reach Orbit/)).toBeInTheDocument();
    expect(screen.getByText(/responsible for any tax/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Stripe/);
  });

  it("avoids jargon", () => {
    renderPlain(<TermsContent details={OPERATOR} />);

    expect(document.body.textContent).not.toMatch(/MCP|OAuth|connector|token|hash/i);
  });
});
