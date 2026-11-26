import type { SpaceLatest } from "@/lib/api.types";
import type { LatestWording } from "@/lib/space-activity.types";

export function describeLatest(latest: SpaceLatest): LatestWording {
  const verb = latest.kind === "plan" ? "wrote" : "added";
  if (latest.author_kind === "orbit") {
    return { subject: "Orbit", verb };
  }
  const via = latest.via.trim();
  if (via !== "" && via.toLowerCase() !== "web") {
    return { subject: via, verb };
  }
  return { subject: latest.shared_by_name ?? "Someone", verb };
}
