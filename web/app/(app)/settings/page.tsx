import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { SettingsScreen } from "@/components/settings/settings-screen";
import type { Me, SpacesResponse } from "@/lib/api.types";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [me, spaces] = await Promise.all([
    serverGet<Me>("/api/me", "/settings"),
    serverGet<SpacesResponse>("/api/spaces", "/settings"),
  ]);
  return (
    <AppShell me={me} current="settings" width="narrow">
      <SettingsScreen me={me} initialSpaces={spaces} />
    </AppShell>
  );
}
