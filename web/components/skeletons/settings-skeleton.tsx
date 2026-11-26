import { Skeleton } from "@/components/ui/skeleton";

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-[36rem] rounded-lg" />
      <Skeleton className="h-[37.5rem] rounded-lg" />
      <Skeleton className="h-[25rem] rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="mt-4 h-44 rounded-lg" />
    </div>
  );
}
