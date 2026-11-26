export const SPACE_EVENT_TYPES = [
  "item_added",
  "item_retracted",
  "memory_set",
  "plan_added",
  "member_joined",
  "template_changed",
  "profile_changed",
  "invites_changed",
] as const;

export type SpaceEventType = (typeof SPACE_EVENT_TYPES)[number];

export type SpaceEvent = {
  type: SpaceEventType;
  data: Record<string, unknown>;
};

export type SpaceEventHandlers = {
  onEvent: (event: SpaceEvent) => void;
  onResync: () => void;
};

export type ConnectionStatus = "connecting" | "live" | "offline";
