import type { Item } from "@/lib/api.types";

export type FeedState = {
  items: Item[];
  nextBefore: string | null;
  extended: boolean;
};
