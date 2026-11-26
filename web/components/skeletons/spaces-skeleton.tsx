import { Skeleton } from "@/components/ui/skeleton";

export function SpacesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-12 w-36 rounded-md" />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-11 w-full rounded-full sm:w-96" />
        <Skeleton className="h-10 w-full rounded-full sm:w-80" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="overflow-hidden rounded-lg border bg-card">
            <Skeleton className="aspect-[16/10] rounded-none" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-8 w-32 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
