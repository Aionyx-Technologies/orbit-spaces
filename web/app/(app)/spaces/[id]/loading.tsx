import { ShellSkeleton } from "@/components/skeletons/shell-skeleton";
import { SpaceSkeleton } from "@/components/skeletons/space-skeleton";

export default function Loading() {
  return (
    <ShellSkeleton width="gallery" current="spaces">
      <SpaceSkeleton />
    </ShellSkeleton>
  );
}
