export type DeleteSpaceDialogProps = Readonly<{
  spaceId: string;
  spaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;
