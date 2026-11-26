import type { Metadata } from "next";

import type { SpacePageProps } from "@/app/(app)/spaces/[id]/page.types";
import { AppShell } from "@/components/layout/app-shell";
import { SpaceScreen } from "@/components/space/space-screen";
import { itemsKey, spaceKey } from "@/lib/api";
import type { ItemsPage, Me, SpaceDetail } from "@/lib/api.types";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Space" };

export default async function SpacePage({ params }: SpacePageProps) {
  const { id } = await params;
  const returnTo = `/spaces/${encodeURIComponent(id)}`;
  const [me, space, feed] = await Promise.all([
    serverGet<Me>("/api/me", returnTo),
    serverGet<SpaceDetail>(spaceKey(id), returnTo),
    serverGet<ItemsPage>(itemsKey(id, { limit: FEED_PAGE_SIZE }), returnTo),
  ]);
  return (
    <AppShell me={me} current="spaces" width="gallery">
      <SpaceScreen me={me} initialSpace={space} initialFeed={feed} />
    </AppShell>
  );
}
