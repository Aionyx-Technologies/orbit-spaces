import type { Item } from "@/lib/api.types";

export type FeedProps = Readonly<{
  items: Item[];
  meId: string;
  freshIds: ReadonlySet<string>;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetract: (item: Item) => void;
  timeZone?: string;
}>;
