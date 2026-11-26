import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";

export function InviteSkeleton() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10"
    >
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="flex justify-center">
        <Logo />
      </div>
      <div className="grid gap-5 rounded-lg border bg-card p-7 shadow-card">
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </main>
  );
}
