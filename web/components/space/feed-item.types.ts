import type { Item } from "@/lib/api.types";

export type FeedItemProps = Readonly<{
  item: Item;
  meId: string;
  fresh: boolean;
  onRetract: (item: Item) => void;
}>;
