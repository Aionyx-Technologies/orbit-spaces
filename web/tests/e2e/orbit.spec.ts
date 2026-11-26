import { expect, test, type Page } from "@playwright/test";

import { localPath, openSignInLink, waitForSignInPath } from "./mail";

const ALEX = "alex@example.com";
const BLAKE = "blake@example.com";

function watchForBrokenPages(page: Page, who: string, problems: string[]): void {
  page.on("pageerror", (error) => problems.push(`${who}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/.test(message.text())) {
      problems.push(`${who}: ${message.text()}`);
    }
  });
}

test("two people share, combine and retract in a space, and see each other live", async ({
  browser,
  page: alex,
  request,
}) => {
  const spaceName = `Test space ${Date.now().toString(36)}`;
  const problems: string[] = [];
  const blakeContext = await browser.newContext();
  const blake = await blakeContext.newPage();
  watchForBrokenPages(alex, "Alex", problems);
  watchForBrokenPages(blake, "Blake", problems);

  try {
    await test.step("Alex signs in with a link sent to his email", async () => {
      await alex.goto("/");
      await alex.getByRole("link", { name: "Sign in" }).click();
      await alex.getByLabel("Email").fill(ALEX);
      await alex.getByRole("button", { name: "Email me a link" }).click();
      await expect(alex.getByRole("heading", { name: "Check your email" })).toBeVisible();

      await openSignInLink(alex, await waitForSignInPath(request, ALEX));

      await expect(alex.getByRole("heading", { level: 1, name: "Spaces" })).toBeVisible();
    });

    await test.step("Alex creates a space", async () => {
      await alex.getByRole("button", { name: "New space" }).click();
      await alex.getByRole("button", { name: "Blank", exact: true }).click();
      await alex.getByRole("textbox", { name: "Space name" }).fill(spaceName);
      await alex.getByRole("button", { name: "Create space" }).click();

      await expect(alex.getByRole("heading", { level: 1, name: spaceName })).toBeVisible();
    });

    await test.step("Alex shares a note and saves a fact", async () => {
      await alex
        .getByRole("textbox", { name: "Share something" })
        .fill("Morning flight\nLeaves Dec 20 at 7:10");
      await alex.getByRole("button", { name: "Share", exact: true }).click();
      await expect(alex.getByRole("article", { name: "Morning flight" })).toBeVisible();

      await alex.getByRole("button", { name: "Add a fact" }).click();
      await alex.getByRole("textbox", { name: "Fact name" }).fill("Budget");
      await alex.getByRole("textbox", { name: "Fact value" }).fill("$3,000");
      await alex.getByRole("button", { name: "Save fact" }).click();

      await expect(alex.getByRole("region", { name: "Shared memory" })).toContainText("$3,000");
    });

    let invitePath = "";
    await test.step("Alex creates an invite link", async () => {
      await alex.getByRole("button", { name: "Invite", exact: true }).click();
      await alex.getByRole("button", { name: "Create link" }).click();
      const address = await alex.getByRole("textbox", { name: "Invite link" }).inputValue();
      invitePath = localPath(address);
      await alex.getByRole("button", { name: "Done" }).click();

      expect(invitePath).toMatch(/^\/invite\/.+/);
    });

    await test.step("Blake opens the invite, signs in by email and joins", async () => {
      await blake.goto(invitePath);
      await expect(
        blake.getByRole("heading", { level: 1, name: `Alex invited you to ${spaceName}` }),
      ).toBeVisible();
      await blake.getByRole("textbox", { name: "Email" }).fill(BLAKE);
      await blake.getByRole("button", { name: "Email me a link" }).click();
      await expect(blake.getByRole("heading", { name: "Check your email" })).toBeVisible();

      await openSignInLink(blake, await waitForSignInPath(request, BLAKE));

      await blake.getByRole("button", { name: "Accept invite" }).click();
      await expect(blake.getByRole("heading", { level: 1, name: spaceName })).toBeVisible();
      await expect(blake.getByRole("article", { name: "Morning flight" })).toBeVisible();
      await expect(blake.getByRole("region", { name: "Shared memory" })).toContainText("$3,000");
    });

    await test.step("Alex sees Blake arrive and share, without reloading", async () => {
      await expect(alex.getByRole("list", { name: "2 members" })).toBeVisible();

      await blake
        .getByRole("textbox", { name: "Share something" })
        .fill("Hotel shortlist\nSeaside Inn or Palm View");
      await blake.getByRole("button", { name: "Share", exact: true }).click();

      const arrived = alex.getByRole("article", { name: "Hotel shortlist" });
      await expect(arrived).toBeVisible();
      await expect(arrived).toContainText("Blake");
    });

    await test.step("Alex combines everything into a plan that Blake sees too", async () => {
      await alex.getByRole("button", { name: "Combine" }).click();

      const alexsPlan = alex.getByRole("region", { name: "Latest plan" });
      await expect(alexsPlan).toContainText("Here is the combined plan.");
      await expect(alexsPlan.getByRole("heading", { name: "To settle" })).toBeVisible();
      await expect(blake.getByRole("region", { name: "Latest plan" })).toContainText(
        "Here is the combined plan.",
      );
    });

    await test.step("Blake retracts his note and it disappears for Alex", async () => {
      await blake.getByRole("button", { name: "Retract Hotel shortlist" }).click();
      await blake
        .getByRole("alertdialog", { name: /Retract/ })
        .getByRole("button", { name: "Retract", exact: true })
        .click();

      await expect(blake.getByRole("article", { name: "Hotel shortlist" })).toBeHidden();
      await expect(alex.getByRole("article", { name: "Hotel shortlist" })).toBeHidden();
    });

    await test.step("Alex finds the connector address on the Assistants tab", async () => {
      const nav = alex.getByRole("banner").getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link")).toHaveText(["Spaces", "Assistants"]);
      await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

      await nav.getByRole("link", { name: "Assistants" }).click();

      await expect(alex).toHaveURL(/\/assistants$/);
      await expect(alex.getByRole("heading", { level: 1, name: "Assistants" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Assistants" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(alex.getByRole("textbox", { name: "Orbit connector address" })).toHaveValue(
        /\/mcp$/,
      );
      await expect(alex.getByRole("region", { name: "Connected assistants" })).toBeVisible();
    });

    await test.step("Alex opens settings from the avatar and signs out", async () => {
      await alex.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
      await expect(alex).toHaveURL(/\/settings$/);
      await expect(alex.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await expect(alex.getByRole("textbox", { name: "Orbit connector address" })).toHaveCount(0);

      await alex.getByRole("button", { name: "Sign out", exact: true }).click();

      await expect(
        alex.getByRole("heading", { level: 1, name: "Work together across AI assistants" }),
      ).toBeVisible();
    });

    expect(problems).toEqual([]);
  } finally {
    await blakeContext.close();
  }
});

test("anyone can read the privacy, terms and data policy pages without signing in", async ({
  page,
}) => {
  const problems: string[] = [];
  watchForBrokenPages(page, "Visitor", problems);

  await page.goto("/");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByText("Run by", { exact: true })).toBeVisible();
  await expect(page.getByText(/has not added their details yet/)).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Policies" })
    .getByRole("link", { name: "Terms" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Plans written by Orbit" }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Policies" })
    .getByRole("link", { name: "Data policy" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Data policy" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "What Orbit stores" })).toBeVisible();

  await page.getByRole("link", { name: "Orbit home" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Work together across AI assistants" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("the demo buttons open Alex's and Blake's pages without an email", async ({
  browser,
  page: alex,
}) => {
  const problems: string[] = [];
  const blakeContext = await browser.newContext();
  const blake = await blakeContext.newPage();
  watchForBrokenPages(alex, "Alex", problems);
  watchForBrokenPages(blake, "Blake", problems);

  try {
    await alex.goto("/");
    await expect(alex.getByRole("region", { name: "Try the demo" })).toBeVisible();
    await alex.getByRole("button", { name: "Continue as Alex" }).click();
    await expect(alex.getByRole("heading", { level: 1, name: "Spaces" })).toBeVisible();
    await expect(
      alex
        .getByRole("list", { name: "Pending spaces" })
        .getByRole("article", { name: "Book club" }),
    ).toBeVisible();
    await alex.getByRole("link", { name: "Goa trip", exact: true }).click();
    await expect(
      alex.getByRole("heading", { level: 1, name: "Goa trip", exact: true }),
    ).toBeVisible();
    await expect(alex.getByRole("article", { name: "Hotel shortlist" })).toBeVisible();
    await expect(alex.getByRole("region", { name: "Latest plan" })).toContainText("Sample plan");

    await blake.goto("/auth/sign-in?next=/spaces");
    await blake.getByRole("button", { name: "Continue as Blake" }).click();
    await expect(blake.getByRole("heading", { level: 1, name: "Spaces" })).toBeVisible();
    await expect(
      blake
        .getByRole("list", { name: "Pending spaces" })
        .getByRole("article", { name: "Weekend in Lisbon" }),
    ).toBeVisible();
    await expect(blake.getByRole("link", { name: "Weekend in Lisbon" })).toHaveCount(0);
    await blake.getByRole("tab", { name: /^Yours/ }).click();
    await expect(blake.getByRole("link", { name: "Cabin weekend", exact: true })).toBeVisible();
    await expect(blake.getByRole("link", { name: "Goa trip", exact: true })).toHaveCount(0);
    await blake.getByRole("tab", { name: /Shared with you/ }).click();
    await blake.getByRole("link", { name: "Goa trip", exact: true }).click();
    await expect(blake.getByRole("list", { name: "2 members" })).toBeVisible();
    expect(problems).toEqual([]);
  } finally {
    await blakeContext.close();
  }
});
