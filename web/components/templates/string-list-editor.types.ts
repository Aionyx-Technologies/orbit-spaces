import type { ReactNode } from "react";

export type StringListEditorProps = Readonly<{
  legend: string;
  itemLabel: string;
  addLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  maxLength: number;
  movable?: boolean;
  placeholder?: string;
  trailing?: ReactNode;
}>;
