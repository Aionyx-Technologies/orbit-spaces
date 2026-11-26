import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { API_URL } from "./environment";
import type { MailDrop } from "./mail.types";

const SIGN_IN_LINK = /https?:\/\/[^\s"<>]+\/auth\/verify\?[^\s"<>]+/;

export function localPath(address: string): string {
  const url = new URL(address);
  return `${url.pathname}${url.search}`;
}

export async function waitForSignInPath(
  request: APIRequestContext,
  email: string,
  alreadySeen = 0,
): Promise<string> {
  let path = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/__test__/emails`, { params: { to: email } });
        const drop = (await response.json()) as MailDrop;
        const links = drop.messages.flatMap((message) => SIGN_IN_LINK.exec(message.text) ?? []);
        const latest = links.length > alreadySeen ? links.at(-1) : undefined;
        path = latest ? localPath(latest) : "";
        return path;
      },
      { message: `a sign-in email for ${email}` },
    )
    .not.toBe("");
  return path;
}

export async function openSignInLink(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Orbit" }).click();
}
