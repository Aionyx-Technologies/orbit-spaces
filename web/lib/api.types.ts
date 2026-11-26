export type ItemKind = "note" | "plan";
export type AuthorKind = "person" | "assistant" | "orbit";
export type InviteStatus = "valid" | "expired" | "used" | "revoked";

export type ApiErrorBody = {
  error: { code: string; message: string };
};

export type EmailFrequency = "instant" | "daily" | "off";

export type Person = {
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type LastSignIn = {
  at: string;
  browser: string;
};

export type AiUses = {
  // null means this server does not limit AI uses.
  limit: number | null;
  used: number;
  remaining: number | null;
  resets_at: string;
};

export type EmailUses = {
  limit: number;
  used: number;
  remaining: number;
};

export type BillingProduct = "plus_monthly" | "plus_yearly" | "ai_pack" | "email_pack";

export type Billing = {
  plan: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
  ai_pack_credits: number;
  email_pack_credits: number;
  can_manage: boolean;
  ai_pack_available: boolean;
  email_pack_available: boolean;
};

export type Me = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  mcp_url: string;
  combine_enabled: boolean;
  draft_enabled: boolean;
  ai_uses: AiUses;
  // null means this person has no daily cap on instant update emails.
  instant_emails: EmailUses | null;
  plan: string;
  billing_enabled: boolean;
  about: string;
  avatar_url: string | null;
  time_zone: string;
  email_frequency: EmailFrequency;
  default_space_id: string | null;
  last_sign_in: LastSignIn | null;
};

// What the plan chip and the Billing card show; a full Me is assignable to it.
export type PlanSummary = Pick<Me, "plan" | "billing_enabled" | "ai_uses" | "instant_emails">;

export type MeChanges = Partial<{
  display_name: string;
  about: string;
  time_zone: string;
  email_frequency: EmailFrequency;
  default_space_id: string | null;
}>;

export type TemplateFact = {
  key: string;
  hint: string;
};

export type Template = {
  id: string;
  name: string;
  icon: string;
  description: string;
  facts: TemplateFact[];
  plan_sections: string[];
  combine_hint: string;
  tips: string[];
};

export type TemplateInput = Omit<Template, "id" | "icon">;

export type SuggestedFact = { key: string; value: string };

export type SpaceSuggestion = {
  suggested: boolean;
  name: string;
  template: Template;
  base_template_id: string;
  facts: SuggestedFact[];
};

export type CreateSpaceFact = { key: string; value: string; suggested: boolean };

export type TemplatesResponse = {
  templates: Template[];
};

export type TemplateDraft = {
  template: Template;
  drafted: boolean;
};

export type SpaceTemplateChoice = { template_id: string } | { template: TemplateInput };

export type Member = {
  user_id: string;
  display_name: string;
  joined_at: string;
  is_you: boolean;
  about: string;
  avatar_url: string | null;
};

export type SpaceHighlight = {
  key: string;
  value: string;
};

export type SpaceLatest = {
  title: string;
  kind: ItemKind;
  via: string;
  author_kind: AuthorKind;
  shared_by_name: string | null;
  created_at: string;
};

export type SpaceSummary = {
  id: string;
  name: string;
  created_at: string;
  is_creator: boolean;
  notify_email: boolean;
  members: Member[];
  owner_name: string | null;
  last_activity_at: string;
  note_count: number;
  fact_count: number;
  has_plan: boolean;
  highlights: SpaceHighlight[];
  latest: SpaceLatest | null;
  sources: string[];
  new_count: number;
};

export type SpacePreviewField =
  | "owner_name"
  | "last_activity_at"
  | "note_count"
  | "fact_count"
  | "has_plan"
  | "highlights"
  | "latest"
  | "sources"
  | "new_count";

export type SpaceSummaryWire = Omit<SpaceSummary, SpacePreviewField> &
  Partial<Pick<SpaceSummary, SpacePreviewField>>;

export type SpaceLimits = {
  created_spaces: number;
  max_created_spaces: number | null;
};

export type SpacesResponse = {
  spaces: SpaceSummaryWire[];
  limits?: SpaceLimits;
};

export type Invitation = {
  id: string;
  space_name: string;
  invited_by: string | null;
  invited_at: string;
  expires_at: string;
};

export type InvitationsResponse = {
  invitations: Invitation[];
};

export type Fact = {
  key: string;
  value: string;
  set_by: Person | null;
  via: string;
  created_at: string;
};

export type Item = {
  id: string;
  space_id: string;
  kind: ItemKind;
  title: string;
  content: string;
  author_kind: AuthorKind;
  shared_by: Person | null;
  via: string;
  created_at: string;
  source_item_ids: string[] | null;
  can_retract: boolean;
};

export type WaitingInvite = {
  id: string;
  email: string;
  invited_by: string | null;
  invited_at: string;
  expires_at: string;
  status: "pending" | "expired";
};

export type SpaceDetail = {
  id: string;
  name: string;
  created_at: string;
  is_creator: boolean;
  notify_email: boolean;
  members: Member[];
  memory: Fact[];
  template: Template;
  unset_facts: TemplateFact[];
  latest_plan: Item | null;
  invites: WaitingInvite[];
};

export type ItemsPage = {
  items: Item[];
  next_before: string | null;
};

export type FactResult = {
  fact: Fact;
  replaced_value: string | null;
  changed: boolean;
};

export type FactRenameInput = {
  key: string;
  new_key: string;
};

export type FactAction = "add" | "edit" | "rename" | "delete";

export type FactEvent = {
  action: FactAction;
  key: string;
  previous_key: string | null;
  value: string;
  previous_value: string | null;
  by: Person | null;
  via: string;
  at: string;
};

export type FactHistory = {
  entries: FactEvent[];
};

export type Membership = {
  notify_email: boolean;
};

export type CombineResult = {
  item: Item;
  created: boolean;
};

export type InviteCreated = {
  url: string;
  expires_at: string;
  emailed: boolean;
};

export type InviteView = {
  status: InviteStatus;
  space_name: string;
  invited_by: string | null;
  expires_at: string;
  signed_in: boolean;
  already_member: boolean;
  inviter_avatar_url: string | null;
};

export type AcceptResult = {
  space_id: string;
  already_member: boolean;
};

export type Connection = {
  id: string;
  client_name: string;
  client_host: string;
  connected_at: string;
};

export type ConnectionsResponse = {
  connections: Connection[];
};

export type SignInStatus = "sent" | "private_testing";

export type SignInResult = {
  status: SignInStatus;
};

export type WaitlistResult = {
  status: "joined";
};

export type SignOutResult = {
  status: "signed_out";
};

export type ShareInput = {
  title: string;
  content: string;
};

export type FactInput = {
  key: string;
  value: string;
};

export type SignInInput = {
  email: string;
  next: string;
  invite: string;
};

export type PageQuery = {
  before?: string | null;
  limit?: number;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestInitOptions = {
  json?: unknown;
  form?: Record<string, string>;
  multipart?: FormData;
};

export type DemoPerson = {
  key: string;
  name: string;
};

export type DemoInfo = {
  enabled: boolean;
  people: DemoPerson[];
};
