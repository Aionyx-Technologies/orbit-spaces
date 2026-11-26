import type { Item } from "@/lib/api.types";

export type RetractDialogProps = Readonly<{
  item: Item | null;
  onClose: () => void;
  onRetracted: (item: Item) => void;
}>;
