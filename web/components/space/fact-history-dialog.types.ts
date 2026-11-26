export type FactHistoryDialogProps = Readonly<{
  spaceId: string;
  /* A fact's current name for its own history; omitted for the whole space. */
  factKey?: string;
  meId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;
