import type { FactResult } from "@/lib/api.types";

export type FactFormProps = Readonly<{
  spaceId: string;
  initialKey?: string;
  initialValue?: string;
  lockKey?: boolean;
  /* Edit in place inside a fact's own row: the row already shows the name. */
  inline?: boolean;
  /* Editing an existing fact: its name can be changed as well as its value. */
  renamable?: boolean;
  /* previousKey is set when the save renamed the fact. */
  onSaved: (result: FactResult, previousKey?: string) => void;
  onCancel: () => void;
  /* Shown as a Delete button when given; the caller confirms and deletes. */
  onDelete?: () => void;
}>;
