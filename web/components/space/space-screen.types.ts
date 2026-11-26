import type { ItemsPage, Me, SpaceDetail } from "@/lib/api.types";

export type SpaceScreenProps = Readonly<{
  me: Me;
  initialSpace: SpaceDetail;
  initialFeed: ItemsPage;
}>;
