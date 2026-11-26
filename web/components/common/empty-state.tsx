import type { EmptyStateProps } from "@/components/common/empty-state.types";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  children,
  icon,
  action,
  className,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div
      className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center sm:py-16", className)}
    >
      {icon ? (
        <div className="relative flex size-16 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-border before:absolute before:-inset-3 before:rounded-full before:border before:border-dashed before:border-line-strong before:content-[''] [&_svg]:size-7">
          {icon}
        </div>
      ) : null}
      <Heading className="mt-2 heading-section">{title}</Heading>
      {children ? (
        <div className="max-w-md text-base text-pretty text-muted-foreground">{children}</div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
