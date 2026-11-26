import { Skeleton } from "@/components/ui/skeleton";

export function SpaceSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-24 rounded-full" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-72 max-w-full" />
            <Skeleton className="h-5 w-56 max-w-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-11 w-28" />
            <Skeleton className="size-11" />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
