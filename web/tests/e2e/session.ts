import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { openSignInLink, waitForSignInPath } from "./mail";

export async function signInByEmail(
  page: Page,
  request: APIRequestContext,
  email: string,
  linksAlreadySent = 0,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await openSignInLink(page, await waitForSignInPath(request, email, linksAlreadySent));

  await expect(page.getByRole("heading", { level: 1, name: "Spaces" })).toBeVisible();
}

export async function continueAsDemoPerson(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: `Continue as ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Spaces" })).toBeVisible();
}
