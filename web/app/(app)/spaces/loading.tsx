import { ShellSkeleton } from "@/components/skeletons/shell-skeleton";
import { SpacesSkeleton } from "@/components/skeletons/spaces-skeleton";

export default function Loading() {
  return (
    <ShellSkeleton width="gallery" current="spaces">
      <SpacesSkeleton />
    </ShellSkeleton>
  );
}
