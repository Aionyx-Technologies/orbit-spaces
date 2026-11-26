import { expect, test, type Page } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { continueAsDemoPerson, signInByEmail } from "./session";
import { showInScheme } from "./theme";

function watchForBrokenPages(page: Page, who: string, problems: string[]): void {
  page.on("pageerror", (error) => problems.push(`${who}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/.test(message.text())) {
      problems.push(`${who}: ${message.text()}`);
    }
  });
}

async function openSettled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function inviteByEmail(page: Page, email: string): Promise<string> {
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await page.getByRole("textbox", { name: "Their email (optional)" }).fill(email);
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByText(`We also emailed this link to ${email}.`)).toBeVisible();
  const address = await page.getByRole("textbox", { name: "Invite link" }).inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  return new URL(address).pathname;
}

async function createSpace(page: Page, name: string): Promise<void> {
  await openSettled(page, "/spaces");
  await page.getByRole("button", { name: "New space" }).first().click();
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  await page.getByRole("textbox", { name: "Space name" }).fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
}

test("an emailed invitation waits under Pending spaces until it is joined or declined", async ({
  browser,
  page: inviter,
  request,
}) => {
  const run = Date.now().toString(36);
  const inviterEmail = `inviter-${run}@example.com`;
  const inviteeEmail = `invitee-${run}@example.com`;
  const joined = `Joined space ${run}`;
  const declined = `Declined space ${run}`;
  const problems: string[] = [];
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  watchForBrokenPages(inviter, "Inviter", problems);
  watchForBrokenPages(invitee, "Invitee", problems);

  try {
    await test.step("the inviter starts two spaces and invites someone to each by email", async () => {
      await signInByEmail(inviter, request, inviterEmail);
      await createSpace(inviter, joined);
      await inviteByEmail(inviter, inviteeEmail);
      await createSpace(inviter, declined);
      await inviteByEmail(inviter, inviteeEmail);
    });

    await test.step("the invitations are waiting in the invitee's app, with no link to find", async () => {
      await signInByEmail(invitee, request, inviteeEmail);

      await expect(invitee.getByRole("tab", { name: /Pending/ })).toContainText("2");
      const pending = invitee.getByRole("list", { name: "Pending spaces" });
      await expect(pending.getByRole("article")).toHaveCount(2);
      await expect(pending.getByRole("article", { name: joined })).toContainText("invited you");
      await expect(pending.getByRole("article", { name: declined })).toContainText(
        "Private until you join",
      );
    });

    await test.step("joining one opens it and moves it under Shared with you", async () => {
      await invitee.getByRole("button", { name: `Join space ${joined}` }).click();
      await expect(
        invitee.getByRole("heading", { level: 1, name: joined, exact: true }),
      ).toBeVisible();

      await invitee.goto("/spaces");

      await expect(invitee.getByRole("tab", { name: /Shared with you/ })).toContainText("1");
      await invitee.getByRole("tab", { name: /Shared with you/ }).click();
      await expect(invitee.getByRole("link", { name: joined, exact: true })).toBeVisible();
      await invitee.getByRole("tab", { name: /^Yours/ }).click();
      await expect(
        invitee.getByRole("heading", { name: "No spaces of your own yet" }),
      ).toBeVisible();
    });

    await test.step("declining the other one asks first and then makes it disappear", async () => {
      await invitee.getByRole("tab", { name: /Pending/ }).click();
      await expect(invitee.getByRole("tab", { name: /Pending/ })).toContainText("1");

      await invitee.getByRole("button", { name: `Decline invitation to ${declined}` }).click();
      await invitee
        .getByRole("alertdialog", { name: "Decline this invitation?" })
        .getByRole("button", { name: "Decline invitation" })
        .click();

      await expect(invitee.getByRole("article", { name: declined })).toBeHidden();
      await expect(invitee.getByRole("heading", { name: "No pending invitations" })).toBeVisible();
    });

    await test.step("the inviter sees both spaces under Yours and none under Shared with you", async () => {
      await inviter.goto("/spaces");

      await expect(inviter.getByRole("tab", { name: /^Yours/ })).toContainText("2");
      await expect(inviter.getByRole("tab", { name: /Shared with you/ })).toContainText("0");
      await inviter.getByRole("tab", { name: /^Yours/ }).click();
      await expect(inviter.getByRole("link", { name: joined, exact: true })).toBeVisible();
      await expect(inviter.getByRole("link", { name: declined, exact: true })).toBeVisible();
      await inviter.getByRole("tab", { name: /Shared with you/ }).click();
      await expect(
        inviter.getByRole("heading", { name: "Nothing shared with you yet" }),
      ).toBeVisible();
    });

    expect(problems).toEqual([]);
  } finally {
    await inviteeContext.close();
  }
});

test("a declined invitation can no longer be used from the emailed link", async ({
  browser,
  page: inviter,
  request,
}) => {
  const run = Date.now().toString(36);
  const inviteeEmail = `guest-${run}@example.com`;
  const space = `Link space ${run}`;
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();

  try {
    await signInByEmail(inviter, request, `host-${run}@example.com`);
    await createSpace(inviter, space);
    const link = await inviteByEmail(inviter, inviteeEmail);

    await signInByEmail(invitee, request, inviteeEmail);
    await invitee.getByRole("button", { name: `Decline invitation to ${space}` }).click();
    await invitee
      .getByRole("alertdialog", { name: "Decline this invitation?" })
      .getByRole("button", { name: "Decline invitation" })
      .click();
    await expect(invitee.getByRole("article", { name: space })).toBeHidden();

    await invitee.goto(link);

    await expect(
      invitee.getByRole("heading", { level: 1, name: "This invite is no longer valid" }),
    ).toBeVisible();
  } finally {
    await inviteeContext.close();
  }
});

test("the home page follows the chosen theme, works from the keyboard and stays accessible", async ({
  page,
}) => {
  const problems: string[] = [];
  watchForBrokenPages(page, "Visitor", problems);

  await test.step("the landing page is accessible in light and dark", async () => {
    await page.goto("/");
    for (const scheme of ["light", "dark"] as const) {
      await showInScheme(page, scheme);
      await expectAccessible(page, `the landing page in ${scheme}`);
    }
  });

  await test.step("the spaces, a space and settings are accessible in light and dark", async () => {
    await continueAsDemoPerson(page, "Alex");
    await expect(page.getByRole("list", { name: "Pending spaces" })).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await showInScheme(page, scheme);
      await expectAccessible(page, `the spaces page in ${scheme}`);
    }

    await page.getByRole("link", { name: "Goa trip", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Goa trip", exact: true }),
    ).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await showInScheme(page, scheme);
      await expectAccessible(page, `a space in ${scheme}`);
    }

    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expectAccessible(page, "settings in dark");

    await page.goto("/assistants");
    await expect(page.getByRole("heading", { level: 1, name: "Assistants" })).toBeVisible();
    await expectAccessible(page, "assistants in dark");
    await showInScheme(page, "light");
    await expectAccessible(page, "assistants in light");
  });

  await test.step("an old settings link to the assistant cards lands on the Assistants page", async () => {
    await page.goto("/settings#connect-title");

    await expect(page).toHaveURL(/\/assistants#connect-title$/);
    await expect(page.getByRole("heading", { level: 1, name: "Assistants" })).toBeVisible();
  });

  await test.step("the chosen theme is remembered and applied before the page paints", async () => {
    await showInScheme(page, "light");
    await openSettled(page, "/spaces");
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const served = await (await page.request.get("/spaces")).text();
    expect(served).toMatch(/<html[^>]*data-theme="dark"/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      "dark",
    );

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  await test.step("the command palette jumps to a space from the keyboard", async () => {
    await openSettled(page, "/spaces");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeVisible();

    await page.getByRole("combobox").fill("goa");
    await expect(page.getByRole("option", { name: /Goa trip/ })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { level: 1, name: "Goa trip", exact: true }),
    ).toBeVisible();
  });

  expect(problems).toEqual([]);
});

test("the home page and a space fit a phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await continueAsDemoPerson(page, "Alex");

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  expect(await overflow()).toBeLessThanOrEqual(0);
  await expect(page.getByRole("tablist", { name: "Filter spaces" })).toBeVisible();

  await page.getByRole("link", { name: "Goa trip", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Goa trip", exact: true }),
  ).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.goto("/assistants");
  await expect(page.getByRole("heading", { level: 1, name: "Assistants" })).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Assistants", exact: true }),
  ).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 375, height: 800 });
  const header = page.getByRole("banner");
  const tabs = await header.getByRole("link", { name: "Assistants", exact: true }).boundingBox();
  const search = await header.getByRole("button", { name: /Search/ }).boundingBox();
  expect(tabs).not.toBeNull();
  expect(search).not.toBeNull();
  expect((tabs?.x ?? 0) + (tabs?.width ?? 0)).toBeLessThanOrEqual(search?.x ?? 0);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("a space made from a template suggests its facts, shows its tips and can be reshaped", async ({
  page,
}) => {
  const name = `Template space ${Date.now().toString(36)}`;
  const problems: string[] = [];
  watchForBrokenPages(page, "Visitor", problems);
  await continueAsDemoPerson(page, "Alex");

  await test.step("the new space dialog offers templates and stays accessible", async () => {
    await page.getByRole("button", { name: "New space" }).first().click();
    await expect(page.getByRole("textbox", { name: "What's this space for?" })).toBeVisible();
    await page.getByRole("button", { name: "✈️ Trip" }).click();
    await expect(page.getByRole("button", { name: "✈️ Trip" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("textbox", { name: "Space name", exact: true }).fill(name);
    await expect(page.getByRole("button", { name: "Create space" })).toBeEnabled();
    // The button fades from its disabled colours; let that finish before checking contrast.
    await page.waitForTimeout(500);
    await expectAccessible(page, "the new space dialog");
    await page.getByRole("button", { name: "Create space" }).click();

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  });

  const memory = page.getByRole("region", { name: "Shared memory" });
  const tips = page.getByRole("region", { name: "Ideas to get started" });

  await test.step("the empty space shows the template's tips and suggested facts", async () => {
    await expect(tips).toContainText("Share a shortlist of places to stay");
    await expect(memory.getByRole("list", { name: "Suggested facts" })).toContainText(
      "Total or per person",
    );
  });

  await test.step("adding a suggested fact removes the suggestion and the tips", async () => {
    await memory.getByRole("button", { name: "Add Budget" }).click();
    // The suggestion opens in place, asking only for the value.
    const budget = memory.getByRole("listitem").filter({ hasText: "Total or per person" });
    await budget.getByRole("textbox", { name: "Fact value" }).fill("$3,000");
    await budget.getByRole("button", { name: "Save fact" }).click();

    await expect(memory).toContainText("$3,000");
    await expect(memory.getByRole("button", { name: "Add Budget" })).toBeHidden();
    await expect(tips).toBeHidden();
  });

  await test.step("any member can reshape the template", async () => {
    await page.getByRole("button", { name: "Space options" }).click();
    await page.getByRole("menuitem", { name: "Edit template" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit template" });
    await expect(dialog.getByText("To settle", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Add a suggested fact" }).click();
    await dialog.getByRole("textbox", { name: "Fact 4 name" }).fill("Passports");
    await dialog.getByRole("textbox", { name: "Fact 4 hint" }).fill("Who still needs one");
    await expectAccessible(page, "the edit template dialog");
    await dialog.getByRole("button", { name: "Save template" }).click();

    await expect(dialog).toBeHidden();
    await expect(memory.getByRole("button", { name: "Add Passports" })).toBeVisible();
    await page.reload();
    await expect(memory.getByRole("button", { name: "Add Passports" })).toBeVisible();
  });

  expect(problems).toEqual([]);
});

test("a space can be set up from one sentence", async ({ page }) => {
  const problems: string[] = [];
  watchForBrokenPages(page, "Visitor", problems);
  await continueAsDemoPerson(page, "Alex");

  await page.getByRole("button", { name: "New space" }).first().click();
  await page
    .getByRole("textbox", { name: "What's this space for?" })
    .fill("Goa trip with college friends, Dec 20–27, 6 of us, about ₹15k each");
  await page.getByRole("button", { name: "Set it up" }).click();

  const name = `Goa trip ${Date.now().toString(36)}`;
  await expect(page.getByRole("textbox", { name: "Space name" })).toHaveValue("Goa trip");
  await page.getByRole("textbox", { name: "Space name" }).fill(name);
  await expect(page.getByRole("button", { name: "Dates: Dec 20–27" })).toBeVisible();
  await page.waitForTimeout(500);
  await expectAccessible(page, "the new space dialog with a suggestion", "[role=dialog]");
  await page.getByRole("button", { name: "Create space" }).click();

  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  await expect(page.getByText("Six friends planning a December week")).toBeVisible();
  const memory = page.getByRole("region", { name: "Shared memory" });
  await expect(memory).toContainText("Dates");
  await expect(memory).toContainText("Dec 20–27");
  await expect(memory).toContainText("Headcount");
  await expect(memory).toContainText("Budget");
  await expect(memory).toContainText("₹15,000 each");
  await expect(memory).toContainText("suggested by Orbit");
  expect(problems).toEqual([]);
});

test("a space can be started from a template chip", async ({ page }) => {
  const problems: string[] = [];
  watchForBrokenPages(page, "Visitor", problems);
  await continueAsDemoPerson(page, "Alex");

  await page.getByRole("button", { name: "New space" }).first().click();
  await page.getByRole("button", { name: "🏠 Household" }).click();
  await page.getByRole("textbox", { name: "Space name" }).fill("Flat 4B");
  await page.getByRole("button", { name: "Create space" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Flat 4B", exact: true })).toBeVisible();
  await expect(page.getByText("Groceries, bills and chores in one place")).toBeVisible();
  expect(problems).toEqual([]);
});
