import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";

import { sansFont } from "@/app/fonts";
import type { RootLayoutProps } from "@/app/layout.types";
import { SkipLink } from "@/components/layout/skip-link";
import { Providers } from "@/components/providers";
import { siteUrl } from "@/lib/site-url";
import { parseTheme, THEME_COOKIE, themeAttribute } from "@/lib/theme";

import "./globals.css";

const SITE_NAME = "Orbit";
const SHARE_TITLE = "Orbit · Work together across AI assistants";
const SHARE_DESCRIPTION =
  "Invite anyone into a shared space, whichever assistant they use: ChatGPT, Claude, Grok, Muse, OpenClaw, Hermes Agent or Wabi. Everyone shares only what they choose.";

// The preview image comes from app/opengraph-image.png and app/twitter-image.png.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: siteUrl(process.env, await headers()),
    applicationName: SITE_NAME,
    title: { default: SHARE_TITLE, template: `%s · ${SITE_NAME}` },
    description: SHARE_DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      url: "/",
      locale: "en",
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c13" },
  ],
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={themeAttribute(theme)} className={sansFont.variable}>
      <body className="min-h-dvh antialiased">
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
