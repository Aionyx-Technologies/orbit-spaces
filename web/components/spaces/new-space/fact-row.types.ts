import type { FactRow } from "@/lib/space-setup.types";

export type FactRowProps = Readonly<{
  row: FactRow;
  onChange: (row: FactRow) => void;
}>;
