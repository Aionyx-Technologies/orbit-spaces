import { Skeleton } from "@/components/ui/skeleton";

export function AssistantsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-80 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}
