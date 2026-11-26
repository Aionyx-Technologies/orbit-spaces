import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { ShellSkeleton } from "@/components/skeletons/shell-skeleton";

export default function Loading() {
  return (
    <ShellSkeleton width="narrow" current="settings">
      <SettingsSkeleton />
    </ShellSkeleton>
  );
}
