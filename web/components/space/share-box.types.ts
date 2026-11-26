import type { Item } from "@/lib/api.types";

export type ShareBoxProps = Readonly<{
  spaceId: string;
  onShared: (item: Item) => void;
}>;
