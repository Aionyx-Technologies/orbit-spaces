import type { Invitation, SpaceSummary } from "@/lib/api.types";
import type { CommandGroup, CommandItem, CommandSection } from "@/lib/command-search.types";
import { normalizeText, sortSpaces } from "@/lib/space-filters";

export const COMMAND_GROUPS: readonly CommandGroup[] = ["Pending", "Spaces", "Actions"];
export const IDLE_SPACE_LIMIT = 5;

const ACTIONS: readonly CommandItem[] = [
  {
    id: "action:new-space",
    group: "Actions",
    label: "New space",
    description: "Start a space and invite someone",
    keywords: ["create", "start", "add"],
    icon: "plus",
    action: { type: "navigate", href: "/spaces?new=1" },
  },
  {
    id: "action:spaces",
    group: "Actions",
    label: "Go to spaces",
    keywords: ["home", "gallery", "all"],
    icon: "grid",
    action: { type: "navigate", href: "/spaces" },
  },
  {
    id: "action:assistants",
    group: "Actions",
    label: "Open assistants",
    description: "Connect an assistant and see which ones have access",
    keywords: [
      "connect",
      "connector",
      "chatgpt",
      "claude",
      "grok",
      "muse",
      "openclaw",
      "hermes",
      "wabi",
      "revoke",
      "assistant",
    ],
    icon: "plug",
    action: { type: "navigate", href: "/assistants" },
  },
  {
    id: "action:settings",
    group: "Actions",
    label: "Open settings",
    description: "Your name, email and account",
    keywords: ["account", "profile", "name", "notifications", "security", "sign out", "delete"],
    icon: "settings",
    action: { type: "navigate", href: "/settings" },
  },
  {
    id: "action:theme-light",
    group: "Actions",
    label: "Switch to light theme",
    keywords: ["appearance", "day", "bright"],
    icon: "sun",
    action: { type: "theme", choice: "light" },
  },
  {
    id: "action:theme-dark",
    group: "Actions",
    label: "Switch to dark theme",
    keywords: ["appearance", "night"],
    icon: "moon",
    action: { type: "theme", choice: "dark" },
  },
  {
    id: "action:theme-system",
    group: "Actions",
    label: "Match my system theme",
    keywords: ["appearance", "auto", "automatic"],
    icon: "monitor",
    action: { type: "theme", choice: "system" },
  },
];

export function buildCommands(
  spaces: readonly SpaceSummary[],
  invitations: readonly Invitation[],
): CommandItem[] {
  const pending: CommandItem[] = invitations.map((invitation) => ({
    id: `invitation:${invitation.id}`,
    group: "Pending",
    label: `Review invitation to ${invitation.space_name}`,
    description: invitation.invited_by ? `From ${invitation.invited_by}` : undefined,
    keywords: [invitation.space_name, invitation.invited_by ?? "", "join", "invite"],
    icon: "mail",
    action: { type: "navigate", href: "/spaces?tab=pending" },
  }));
  const spaceItems: CommandItem[] = sortSpaces(spaces, "activity").map((space) => ({
    id: `space:${space.id}`,
    group: "Spaces",
    label: space.name,
    description: space.is_creator ? "Yours" : `Shared by ${space.owner_name ?? "someone"}`,
    keywords: [
      ...space.members.map((member) => member.display_name),
      ...space.highlights.flatMap((highlight) => [highlight.key, highlight.value]),
      ...space.sources,
    ],
    icon: "space",
    action: { type: "navigate", href: `/spaces/${space.id}` },
  }));
  return [...pending, ...spaceItems, ...ACTIONS];
}

function scoreItem(item: CommandItem, tokens: readonly string[]): number {
  const label = normalizeText(item.label);
  const words = label.split(/\s+/);
  const rest = normalizeText([item.description ?? "", ...item.keywords].join(" "));
  let total = 0;
  for (const token of tokens) {
    if (label.startsWith(token)) {
      total += 4;
    } else if (words.some((word) => word.startsWith(token))) {
      total += 3;
    } else if (label.includes(token)) {
      total += 2;
    } else if (rest.includes(token)) {
      total += 1;
    } else {
      return 0;
    }
  }
  return total;
}

export function searchCommands(items: readonly CommandItem[], query: string): CommandSection[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  const idle = tokens.length === 0;
  return COMMAND_GROUPS.map((group) => {
    const inGroup = items.filter((item) => item.group === group);
    if (idle) {
      return { group, items: group === "Spaces" ? inGroup.slice(0, IDLE_SPACE_LIMIT) : inGroup };
    }
    const ranked = inGroup
      .map((item, order) => ({ item, order, score: scoreItem(item, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((first, second) => second.score - first.score || first.order - second.order);
    return { group, items: ranked.map((entry) => entry.item) };
  }).filter((section) => section.items.length > 0);
}

export function flattenSections(sections: readonly CommandSection[]): CommandItem[] {
  return sections.flatMap((section) => section.items);
}
