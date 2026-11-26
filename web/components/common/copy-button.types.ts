import type { VariantProps } from "class-variance-authority";

import type { buttonVariants } from "@/components/ui/button";

export type CopyButtonProps = Readonly<{
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  onCopied?: () => void;
}>;
