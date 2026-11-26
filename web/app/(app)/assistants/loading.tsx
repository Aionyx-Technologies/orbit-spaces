import { AssistantsSkeleton } from "@/components/skeletons/assistants-skeleton";
import { ShellSkeleton } from "@/components/skeletons/shell-skeleton";

export default function Loading() {
  return (
    <ShellSkeleton width="narrow" current="assistants">
      <AssistantsSkeleton />
    </ShellSkeleton>
  );
}
