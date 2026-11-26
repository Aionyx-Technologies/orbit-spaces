import { TriangleAlertIcon } from "lucide-react";

import type { ErrorNoticeProps } from "@/components/common/error-notice.types";
import { cn } from "@/lib/utils";

export function ErrorNotice({ message, className }: ErrorNoticeProps) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive",
        className,
      )}
    >
      <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
