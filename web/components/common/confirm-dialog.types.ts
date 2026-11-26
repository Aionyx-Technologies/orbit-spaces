import type { ReactNode } from "react";

export type ConfirmDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  error?: string | null;
  confirmDisabled?: boolean;
  children?: ReactNode;
}>;
