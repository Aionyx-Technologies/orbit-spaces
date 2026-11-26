import type { Item } from "@/lib/api.types";

export type UseFeed = {
  items: Item[];
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<string[]>;
  add: (item: Item) => void;
  remove: (itemId: string) => void;
};
