import type { Metadata } from "next";

import type { SpacesPageProps } from "@/app/(app)/spaces/page.types";
import { AppShell } from "@/components/layout/app-shell";
import { SpacesScreen } from "@/components/spaces/spaces-screen";
import type { InvitationsResponse, Me, SpacesResponse } from "@/lib/api.types";
import { NO_INVITATIONS } from "@/lib/invitations";
import { serverGet, serverGetOrDefault } from "@/lib/server-api";
import { parseTab } from "@/lib/space-filters";

export const metadata: Metadata = { title: "Spaces" };

export default async function SpacesPage({ searchParams }: SpacesPageProps) {
  const [me, spaces, invitations, params] = await Promise.all([
    serverGet<Me>("/api/me", "/spaces"),
    serverGet<SpacesResponse>("/api/spaces", "/spaces"),
    serverGetOrDefault<InvitationsResponse>("/api/invitations", "/spaces", NO_INVITATIONS),
    searchParams,
  ]);
  return (
    <AppShell me={me} current="spaces" width="gallery">
      <SpacesScreen
        initial={spaces}
        initialInvitations={invitations}
        initialTab={parseTab(params.tab)}
        openNewSpace={params.new === "1"}
      />
    </AppShell>
  );
}
