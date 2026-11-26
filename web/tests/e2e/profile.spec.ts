import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { localPath, openSignInLink, waitForSignInPath } from "./mail";
import { signInByEmail } from "./session";
import { showInScheme } from "./theme";

const PORTRAIT = join(__dirname, "fixtures", "portrait.png");
const ABOUT = "Plans the trips and books the trains.";

function watchForBrokenPages(page: Page, who: string, problems: string[]): void {
  page.on("pageerror", (error) => problems.push(`${who}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/.test(message.text())) {
      problems.push(`${who}: ${message.text()}`);
    }
  });
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function createSpace(page: Page, name: string): Promise<void> {
  await page.goto("/spaces");
  await page.getByRole("button", { name: "New space" }).first().click();
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  await page.getByRole("textbox", { name: "Space name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
}

async function chooseAndSavePhoto(page: Page): Promise<void> {
  await page.getByLabel("Choose a photo").setInputFiles(PORTRAIT);
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save photo" })).toBeEnabled();
  await dialog.getByRole("slider", { name: "Zoom" }).fill("1.6");
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(dialog).toBeHidden();
}

function photoIn(scope: Locator): Locator {
  return scope.locator("img[src*='/api/users/']");
}

test("a person adds a photo and an about line, and the others in their space see them live", async ({
  browser,
  page: pat,
  request,
}) => {
  const run = Date.now().toString(36);
  const patEmail = `pat-${run}@example.com`;
  const robinEmail = `robin-${run}@example.com`;
  const spaceName = `Photo space ${run}`;
  const problems: string[] = [];
  const robinContext = await browser.newContext();
  const robin = await robinContext.newPage();
  watchForBrokenPages(pat, "Pat", problems);
  watchForBrokenPages(robin, "Robin", problems);

  try {
    await test.step("Pat signs in, names themselves and writes an about line", async () => {
      await signInByEmail(pat, request, patEmail);
      await openSettings(pat);
      const profile = pat.getByRole("region", { name: "Profile" });
      await expect(profile.getByRole("img", { name: "No profile photo yet" })).toBeVisible();

      await profile.getByRole("textbox", { name: "Display name" }).fill("Pat Rivera");
      await profile.getByRole("textbox", { name: "About me" }).fill(ABOUT);
      await expect(profile).toContainText(`${ABOUT.length} of 160`);
      await profile.getByRole("button", { name: "Save profile" }).click();
      await expect(pat.getByText("Profile saved")).toBeVisible();

      await pat.reload();
      await expect(pat.getByRole("textbox", { name: "Display name" })).toHaveValue("Pat Rivera");
      await expect(pat.getByRole("textbox", { name: "About me" })).toHaveValue(ABOUT);
      const signedIn = pat.getByRole("region", { name: "Profile" });
      await expect(signedIn).toContainText("Signed in as");
      await expect(signedIn).toContainText(patEmail);
    });

    let invitePath = "";
    await test.step("Pat starts a space, shares a note and invites Robin", async () => {
      await createSpace(pat, spaceName);
      await pat
        .getByRole("textbox", { name: "Share something" })
        .fill("Morning flight\nLeaves Dec 20 at 7:10");
      await pat.getByRole("button", { name: "Share", exact: true }).click();
      await expect(pat.getByRole("article", { name: "Morning flight" })).toBeVisible();

      await pat.getByRole("button", { name: "Invite", exact: true }).click();
      await pat.getByRole("button", { name: "Create link" }).click();
      invitePath = localPath(await pat.getByRole("textbox", { name: "Invite link" }).inputValue());
      await pat.getByRole("button", { name: "Done" }).click();
    });

    await test.step("the invite page shows who is inviting, even without a photo", async () => {
      await robin.goto(invitePath);

      await expect(
        robin.getByRole("heading", { level: 1, name: `Pat Rivera invited you to ${spaceName}` }),
      ).toBeVisible();
      await expect(robin.locator("[data-slot='avatar']").first()).toContainText("PR");
    });

    await test.step("Robin joins and sees Pat's initials in the members panel", async () => {
      await robin.getByRole("textbox", { name: "Email" }).fill(robinEmail);
      await robin.getByRole("button", { name: "Email me a link" }).click();
      await expect(robin.getByRole("heading", { name: "Check your email" })).toBeVisible();
      await openSignInLink(robin, await waitForSignInPath(request, robinEmail));
      await robin.getByRole("button", { name: "Accept invite" }).click();
      await expect(robin.getByRole("heading", { level: 1, name: spaceName })).toBeVisible();

      const members = robin.getByRole("region", { name: "Members" });
      await expect(members.getByRole("list", { name: "2 members" })).toBeVisible();
      await expect(members.getByRole("button", { name: "Pat Rivera's profile" })).toContainText(
        "PR",
      );
      await expect(photoIn(members)).toHaveCount(0);
    });

    await test.step("a file that is not a JPEG, PNG or WebP is refused in plain words", async () => {
      await openSettings(pat);
      await pat.getByLabel("Choose a photo").setInputFiles({
        name: "loop.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("GIF89a"),
      });

      await expect(pat.getByRole("region", { name: "Profile" }).getByRole("alert")).toContainText(
        "Use a JPEG, PNG or WebP picture. GIF and SVG files are not supported.",
      );
      await expect(pat.getByRole("dialog")).toHaveCount(0);
    });

    await test.step("a file that only claims to be a picture is stopped at the crop step", async () => {
      await pat.getByLabel("Choose a photo").setInputFiles({
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("this is not a picture"),
      });

      const dialog = pat.getByRole("dialog", { name: "Crop your photo" });
      await expect(dialog.getByRole("alert")).toContainText(
        "That picture could not be read. Choose a different one.",
      );
      await expect(dialog.getByRole("button", { name: "Save photo" })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step("the crop step is accessible, in light and dark", async () => {
      await pat.getByLabel("Choose a photo").setInputFiles(PORTRAIT);
      const dialog = pat.getByRole("dialog", { name: "Crop your photo" });
      await expect(dialog.getByRole("button", { name: "Save photo" })).toBeEnabled();

      for (const scheme of ["light", "dark"] as const) {
        await showInScheme(pat, scheme);
        await expectAccessible(pat, `the crop step in ${scheme}`);
      }

      await dialog.getByRole("group", { name: "Photo crop area" }).focus();
      await pat.keyboard.press("ArrowLeft");
      await pat.keyboard.press("+");
      await expect(dialog.getByRole("slider", { name: "Zoom" })).toHaveValue("1.25");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await showInScheme(pat, "light");
    });

    await test.step("Pat crops and saves a photo, and it shows in the header and the card", async () => {
      await chooseAndSavePhoto(pat);

      const profile = pat.getByRole("region", { name: "Profile" });
      await expect(profile.getByRole("img", { name: "Your profile photo" })).toBeVisible();
      await expect(profile.getByRole("button", { name: "Remove photo" })).toBeVisible();
      const headerAvatar = pat.getByRole("banner").getByRole("link", { name: "Settings" });
      await expect(photoIn(headerAvatar)).toHaveCount(1);
      await expect
        .poll(() => photoIn(headerAvatar).evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    });

    await test.step("the photo is served as a small WebP picture, only to people allowed to see it", async () => {
      const source = (await photoIn(pat.getByRole("banner")).getAttribute("src")) ?? "";
      expect(source).toMatch(/^\/api\/users\/[^/]+\/avatar\?v=\d+$/);

      const served = await pat.request.get(source);

      expect(served.status()).toBe(200);
      expect(served.headers()["content-type"]).toBe("image/webp");
      expect(served.headers()["x-content-type-options"]).toBe("nosniff");
      expect((await served.body()).length).toBeLessThan(40_000);
      const stranger = await browser.newContext();
      const refused = await stranger.request.get(source);
      expect(refused.status()).toBe(401);
      await stranger.close();
    });

    await test.step("Robin sees Pat's photo in the members panel and beside Pat's note, without reloading", async () => {
      const members = robin.getByRole("region", { name: "Members" });
      await expect(photoIn(members)).toHaveCount(1);
      const note = robin.getByRole("article", { name: "Morning flight" });
      await expect(photoIn(note)).toHaveCount(1);
      await expect
        .poll(() => photoIn(members).evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    });

    await test.step("Robin opens Pat's card from the keyboard and reads the about line", async () => {
      const members = robin.getByRole("region", { name: "Members" });
      await members.getByRole("button", { name: "Pat Rivera's profile" }).focus();
      await robin.keyboard.press("Enter");

      const card = robin.getByRole("dialog", { name: "Pat Rivera's profile" });
      await expect(card).toContainText("Pat Rivera");
      await expect(card).toContainText(ABOUT);
      await expect(photoIn(card)).toHaveCount(1);
      await expectAccessible(robin, "a space with a profile card open");
      await robin.keyboard.press("Escape");
      await expect(card).toBeHidden();
    });

    await test.step("Robin opens the same card from the feed", async () => {
      const note = robin.getByRole("article", { name: "Morning flight" });
      await note.getByRole("button", { name: "Pat Rivera's profile" }).click();

      await expect(robin.getByRole("dialog", { name: "Pat Rivera's profile" })).toContainText(
        ABOUT,
      );
      await robin.keyboard.press("Escape");
    });

    await test.step("settings with a photo is accessible in light and dark", async () => {
      await openSettings(pat);
      await expect(pat.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      for (const scheme of ["light", "dark"] as const) {
        await showInScheme(pat, scheme);
        await expectAccessible(pat, `settings with a photo in ${scheme}`);
      }
      await showInScheme(pat, "light");
    });

    await test.step("Pat removes the photo and Robin's page goes back to initials", async () => {
      await pat.getByRole("button", { name: "Remove photo" }).click();

      await expect(pat.getByRole("button", { name: "Upload photo" })).toBeVisible();
      await expect(photoIn(pat.getByRole("banner"))).toHaveCount(0);
      const members = robin.getByRole("region", { name: "Members" });
      await expect(photoIn(members)).toHaveCount(0);
      await expect(members.getByRole("button", { name: "Pat Rivera's profile" })).toContainText(
        "PR",
      );
    });

    await test.step("the invite page shows the inviter's photo once there is one", async () => {
      await chooseAndSavePhoto(pat);
      await pat.goto(`/spaces`);
      await pat.getByRole("link", { name: spaceName, exact: true }).click();
      await pat.getByRole("button", { name: "Invite", exact: true }).click();
      await pat.getByRole("button", { name: "Create link" }).click();
      const another = localPath(
        await pat.getByRole("textbox", { name: "Invite link" }).inputValue(),
      );
      await pat.getByRole("button", { name: "Done" }).click();

      const stranger = await browser.newContext();
      const visitor = await stranger.newPage();
      await visitor.goto(another);
      await expect(
        visitor.getByRole("heading", { level: 1, name: `Pat Rivera invited you to ${spaceName}` }),
      ).toBeVisible();
      const picture = visitor.locator("img[src*='/inviter-avatar']");
      await expect(picture).toHaveCount(1);
      await expect
        .poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
      await expectAccessible(visitor, "the invite page with a photo");
      await stranger.close();
    });
  } finally {
    await robinContext.close();
  }

  expect(problems).toEqual([]);
});

test("email, preferences and security are saved, agree with the space page, and sign out everywhere ends every session", async ({
  browser,
  request,
}) => {
  const run = Date.now().toString(36);
  const email = `sam-${run}@example.com`;
  const spaceName = `Mail space ${run}`;
  const problems: string[] = [];
  const first = await browser.newContext({ timezoneId: "Asia/Kolkata", locale: "en-GB" });
  const second = await browser.newContext();
  const here = await first.newPage();
  const elsewhere = await second.newPage();
  watchForBrokenPages(here, "Sam", problems);

  try {
    await test.step("Sam signs in on two browsers and starts a space", async () => {
      await signInByEmail(here, request, email);
      await signInByEmail(elsewhere, request, email, 1);
      await createSpace(here, spaceName);
    });

    await test.step("emails start as they happen, with a switch for the space", async () => {
      await openSettings(here);

      const emails = here.getByRole("region", { name: "Email notifications" });
      await expect(emails.getByRole("radio", { name: /As it happens/ })).toBeChecked();
      await expect(emails.getByRole("switch", { name: spaceName })).toBeChecked();
      await expect(emails).toContainText("Sign-in links and invitations are always sent.");
    });

    await test.step("the switch on the space page and in settings always agree", async () => {
      await here.getByRole("switch", { name: spaceName }).click();
      await expect(here.getByText("Email notifications off")).toBeVisible();

      await here.goto("/spaces");
      await here.getByRole("link", { name: spaceName, exact: true }).click();
      const panel = here.getByRole("region", { name: "Members" });
      await expect(
        panel.getByRole("switch", { name: "Email me about this space" }),
      ).not.toBeChecked();

      await panel.getByRole("switch", { name: "Email me about this space" }).click();
      await expect(here.getByText("Email notifications on")).toBeVisible();
      await openSettings(here);
      await expect(here.getByRole("switch", { name: spaceName })).toBeChecked();
    });

    await test.step("a daily summary is remembered, and Off hides the switches everywhere", async () => {
      await here.getByRole("radio", { name: /Daily summary/ }).click();
      await expect(here.getByText("Emails set to a daily summary")).toBeVisible();
      await here.reload();
      await expect(here.getByRole("radio", { name: /Daily summary/ })).toBeChecked();
      await expect(here.getByRole("switch", { name: spaceName })).toBeVisible();

      await here.getByRole("radio", { name: /^Off/ }).click();
      await expect(here.getByText("Activity emails turned off")).toBeVisible();
      await expect(here.getByRole("switch", { name: spaceName })).toHaveCount(0);

      await here.goto("/spaces");
      await here.getByRole("link", { name: spaceName, exact: true }).click();
      await expect(here.getByText("Activity emails are off for your account.")).toBeVisible();
      await expect(here.getByRole("switch", { name: "Email me about this space" })).toHaveCount(0);
      await here.getByRole("link", { name: "Change that in Settings" }).click();
      await expect(here.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

      await here.getByRole("radio", { name: /As it happens/ }).click();
      await expect(here.getByText("Emails set to as it happens")).toBeVisible();
      await expect(here.getByRole("switch", { name: spaceName })).toBeVisible();
    });

    await test.step("the time zone is filled in from the browser, and kept once saved", async () => {
      await here.reload();
      const preferences = here.getByRole("region", { name: "Preferences" });
      const zone = preferences.getByRole("combobox", { name: "Time zone" });
      await expect(zone).toHaveValue("Asia/Kolkata");
      await expect(preferences).toContainText("Filled in from your browser. Save to keep it.");

      await preferences.getByRole("button", { name: "Save preferences" }).click();
      await expect(here.getByText("Preferences saved")).toBeVisible();
      await here.reload();

      await expect(zone).toHaveValue("Asia/Kolkata");
      await expect(preferences).not.toContainText("Filled in from your browser");
      await expect(preferences.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    });

    await test.step("a default space can be chosen and cleared", async () => {
      const preferences = here.getByRole("region", { name: "Preferences" });
      const space = preferences.getByRole("combobox", { name: "Default space" });
      await expect(space.locator("option").first()).toHaveText("Ask me each time");

      await space.selectOption({ label: spaceName });
      await preferences.getByRole("button", { name: "Save preferences" }).click();
      await expect(here.getByText("Preferences saved")).toBeVisible();
      await here.reload();
      await expect(space.locator("option:checked")).toHaveText(spaceName);

      await space.selectOption({ label: "Ask me each time" });
      await preferences.getByRole("button", { name: "Save preferences" }).click();
      await expect(here.getByText("Preferences saved")).toBeVisible();
      await here.reload();
      await expect(space.locator("option:checked")).toHaveText("Ask me each time");
    });

    await test.step("the page lists six cards in order and stays accessible in light and dark", async () => {
      const titles = await here.getByRole("region").locator("h2").allTextContents();
      expect(titles).toEqual([
        "Profile",
        "Email notifications",
        "Preferences",
        "Security",
        "Your data",
        "Delete account",
      ]);
      for (const scheme of ["light", "dark"] as const) {
        await showInScheme(here, scheme);
        await expectAccessible(here, `settings in ${scheme}`);
      }
      await showInScheme(here, "light");
    });

    await test.step("the last sign-in is shown by date and browser, nothing more", async () => {
      const security = here.getByRole("region", { name: "Security" });

      await expect(security.getByText(/^Last sign-in: \d{1,2} \w{3,4} \d{4}, \w+$/)).toBeVisible();
      await expect(security.getByRole("link", { name: "Assistants tab" })).toHaveAttribute(
        "href",
        "/assistants",
      );
    });

    await test.step("signing out everywhere ends this session and the other one", async () => {
      await openSettings(elsewhere);
      await expect(elsewhere.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

      await here.getByRole("button", { name: "Sign out everywhere" }).click();
      const confirmation = here.getByRole("alertdialog", { name: "Sign out everywhere?" });
      await expect(confirmation).toContainText("Assistants you have connected stay connected.");
      await confirmation.getByRole("button", { name: "Sign out everywhere" }).click();

      await expect(here).toHaveURL(/\/auth\/sign-in\?next=%2Fsettings$/);
      await elsewhere.reload();
      await expect(elsewhere).toHaveURL(/\/auth\/sign-in/);
      await here.goto("/settings");
      await expect(here).toHaveURL(/\/auth\/sign-in/);
    });
  } finally {
    await first.close();
    await second.close();
  }

  expect(problems).toEqual([]);
});

test("settings and the crop step fit a phone without sideways scrolling", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInByEmail(page, request, `phone-${Date.now().toString(36)}@example.com`);
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  await openSettings(page);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByLabel("Choose a photo").setInputFiles(PORTRAIT);
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog.getByRole("button", { name: "Save photo" })).toBeEnabled();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1) >= 0).toBe(true);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  expect(await overflow()).toBeLessThanOrEqual(0);
});
