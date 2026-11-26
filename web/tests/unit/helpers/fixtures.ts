import type {
  Billing,
  Connection,
  Fact,
  Invitation,
  InviteView,
  Item,
  ItemsPage,
  Me,
  Member,
  SpaceDetail,
  SpaceSummary,
  Template,
  TemplateInput,
} from "@/lib/api.types";

export const ALEX_ID = "user-alex";
export const BLAKE_ID = "user-blake";

export function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: ALEX_ID,
    email: "alex@example.com",
    display_name: "Alex",
    created_at: "2026-11-01T09:00:00Z",
    mcp_url: "https://orbit.example.com/mcp",
    combine_enabled: true,
    draft_enabled: true,
    ai_uses: { limit: 20, used: 0, remaining: 20, resets_at: "2026-12-01T09:00:00Z" },
    instant_emails: null,
    plan: "free",
    billing_enabled: false,
    about: "",
    avatar_url: null,
    time_zone: "UTC",
    email_frequency: "instant",
    default_space_id: null,
    last_sign_in: null,
    ...overrides,
  };
}

export function makeBilling(overrides: Partial<Billing> = {}): Billing {
  return {
    plan: "free",
    status: "none",
    period_end: null,
    cancel_at_period_end: false,
    ai_pack_credits: 0,
    email_pack_credits: 0,
    can_manage: false,
    ai_pack_available: true,
    email_pack_available: true,
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "general",
    name: "General",
    icon: "",
    description: "No specific purpose",
    facts: [],
    plan_sections: ["Summary", "Next steps", "To settle"],
    combine_hint: "",
    tips: ["Share a note or link everyone should see"],
    ...overrides,
  };
}

export function templateInputOf(template: Template): TemplateInput {
  return {
    name: template.name,
    description: template.description,
    facts: template.facts,
    plan_sections: template.plan_sections,
    combine_hint: template.combine_hint,
    tips: template.tips,
  };
}

export const FAMILY_VACATION = makeTemplate({
  id: "trip",
  name: "Trip",
  description: "Plan a trip together",
  facts: [
    { key: "Dates", hint: "When you are travelling" },
    { key: "Budget", hint: "Total for the trip" },
    { key: "Destination", hint: "Where you are going" },
  ],
  plan_sections: ["Where to stay", "Getting there", "Daily outline", "Costs", "To settle"],
  combine_hint: "Balance everyone's preferences and stay within the budget.",
  tips: ["Share a hotel shortlist", "Set the budget", "Add the dates"],
});

export function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    user_id: ALEX_ID,
    display_name: "Alex",
    joined_at: "2026-11-01T09:00:00Z",
    is_you: true,
    about: "",
    avatar_url: null,
    ...overrides,
  };
}

export const ALEX = makeMember();
export const BLAKE = makeMember({
  user_id: BLAKE_ID,
  display_name: "Blake",
  is_you: false,
  joined_at: "2026-11-02T09:00:00Z",
});

export function makeSpaceSummary(overrides: Partial<SpaceSummary> = {}): SpaceSummary {
  return {
    id: "space-1",
    name: "Goa trip",
    created_at: "2026-11-01T09:00:00Z",
    is_creator: true,
    notify_email: true,
    members: [ALEX, BLAKE],
    owner_name: "Alex",
    last_activity_at: "2026-11-19T10:00:00Z",
    note_count: 3,
    fact_count: 2,
    has_plan: false,
    highlights: [
      { key: "Dates", value: "Dec 20 to 23" },
      { key: "Budget", value: "$3,000" },
    ],
    latest: {
      title: "Hotel shortlist",
      kind: "note",
      via: "Grok",
      author_kind: "assistant",
      shared_by_name: "Blake",
      created_at: "2026-11-19T10:00:00Z",
    },
    sources: ["ChatGPT", "Grok"],
    new_count: 0,
    ...overrides,
  };
}

export function makeQuietSpace(overrides: Partial<SpaceSummary> = {}): SpaceSummary {
  return makeSpaceSummary({
    note_count: 0,
    fact_count: 0,
    highlights: [],
    latest: null,
    sources: [],
    last_activity_at: "2026-11-01T09:00:00Z",
    ...overrides,
  });
}

export function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invitation-1",
    space_name: "Weekend in Lisbon",
    invited_by: "Alex",
    invited_at: "2026-11-19T09:00:00Z",
    expires_at: "2026-11-26T09:00:00Z",
    ...overrides,
  };
}

export function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    key: "Dates",
    value: "Dec 20 to 23",
    set_by: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null },
    via: "ChatGPT",
    created_at: "2026-11-18T10:00:00Z",
    ...overrides,
  };
}

export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    space_id: "space-1",
    kind: "note",
    title: "Morning flight",
    content: "Leaves Dec 20 at 7:10",
    author_kind: "assistant",
    shared_by: { user_id: BLAKE_ID, display_name: "Blake", avatar_url: null },
    via: "Grok",
    created_at: "2026-11-19T10:00:00Z",
    source_item_ids: null,
    can_retract: false,
    ...overrides,
  };
}

export function makePlan(overrides: Partial<Item> = {}): Item {
  return makeItem({
    id: "plan-1",
    kind: "plan",
    title: "Combined plan",
    content: "Stay at Hotel 2.\n\nTo settle\n- Check-in time",
    author_kind: "orbit",
    shared_by: null,
    via: "ChatGPT",
    source_item_ids: ["item-1"],
    ...overrides,
  });
}

export function makeSpaceDetail(overrides: Partial<SpaceDetail> = {}): SpaceDetail {
  return {
    id: "space-1",
    name: "Goa trip",
    created_at: "2026-11-01T09:00:00Z",
    is_creator: true,
    notify_email: true,
    members: [ALEX, BLAKE],
    memory: [makeFact()],
    template: makeTemplate(),
    unset_facts: [],
    latest_plan: null,
    invites: [],
    ...overrides,
  };
}

export function makeItemsPage(
  items: Item[] = [makeItem()],
  nextBefore: string | null = null,
): ItemsPage {
  return { items, next_before: nextBefore };
}

export function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "conn-1",
    client_name: "ChatGPT",
    client_host: "chatgpt.com",
    connected_at: "2026-11-10T09:00:00Z",
    ...overrides,
  };
}

export function makeInviteView(overrides: Partial<InviteView> = {}): InviteView {
  return {
    status: "valid",
    space_name: "Goa trip",
    invited_by: "Blake",
    expires_at: "2026-11-26T09:00:00Z",
    signed_in: false,
    already_member: false,
    inviter_avatar_url: null,
    ...overrides,
  };
}
