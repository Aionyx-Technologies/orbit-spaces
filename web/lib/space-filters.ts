import type { Invitation, SpaceSummary } from "@/lib/api.types";
import type {
  SpaceCounts,
  SpaceLayout,
  SpaceSort,
  SpaceTab,
  SpacesEmptyKind,
} from "@/lib/space-filters.types";

export const SPACE_TABS: readonly SpaceTab[] = ["all", "yours", "shared", "pending"];
export const SPACE_SORTS: readonly SpaceSort[] = ["activity", "name", "created"];
export const SPACE_LAYOUTS: readonly SpaceLayout[] = ["grid", "list"];

export function parseTab(value: string | null | undefined): SpaceTab {
  return SPACE_TABS.find((tab) => tab === value) ?? "all";
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matchesQuery(parts: readonly (string | null | undefined)[], query: string): boolean {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = normalizeText(parts.filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function spaceSearchParts(space: SpaceSummary): string[] {
  return [
    space.name,
    space.owner_name,
    space.latest?.title,
    ...space.members.map((member) => member.display_name),
    ...space.highlights.flatMap((highlight) => [highlight.key, highlight.value]),
    ...space.sources,
  ].filter((part): part is string => typeof part === "string");
}

export function filterSpaces(
  spaces: readonly SpaceSummary[],
  tab: SpaceTab,
  query: string,
): SpaceSummary[] {
  if (tab === "pending") {
    return [];
  }
  return spaces.filter((space) => {
    const inTab =
      tab === "all" ||
      (tab === "yours" && space.is_creator) ||
      (tab === "shared" && !space.is_creator);
    return inTab && matchesQuery(spaceSearchParts(space), query);
  });
}

export function filterInvitations(invitations: readonly Invitation[], query: string): Invitation[] {
  return invitations.filter((invitation) =>
    matchesQuery([invitation.space_name, invitation.invited_by], query),
  );
}

function byRecent(first: string, second: string): number {
  return Date.parse(second) - Date.parse(first);
}

const compareNames = new Intl.Collator("en", { sensitivity: "base", numeric: true }).compare;

export function sortSpaces(spaces: readonly SpaceSummary[], sort: SpaceSort): SpaceSummary[] {
  const ordered = [...spaces];
  ordered.sort((first, second) => {
    if (sort === "name") {
      return compareNames(first.name, second.name);
    }
    const primary =
      sort === "created"
        ? byRecent(first.created_at, second.created_at)
        : byRecent(first.last_activity_at, second.last_activity_at);
    return primary !== 0 ? primary : compareNames(first.name, second.name);
  });
  return ordered;
}

export function emptyKindFor(blank: boolean, searching: boolean, tab: SpaceTab): SpacesEmptyKind {
  if (blank) {
    return "none";
  }
  if (searching) {
    return "search";
  }
  return tab === "all" ? "yours" : tab;
}

export function countSpaces(
  spaces: readonly SpaceSummary[],
  invitations: readonly Invitation[],
): SpaceCounts {
  const yours = spaces.filter((space) => space.is_creator).length;
  return {
    all: spaces.length,
    yours,
    shared: spaces.length - yours,
    pending: invitations.length,
  };
}
