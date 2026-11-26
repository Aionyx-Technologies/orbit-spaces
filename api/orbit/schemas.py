from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from orbit.billing import Product
from orbit.limits import TEMPLATE_FACTS_MAX

ItemKind = Literal["note", "plan"]
AuthorKind = Literal["person", "assistant", "orbit"]
InviteStatus = Literal["valid", "expired", "used", "revoked"]
FactAction = Literal["add", "edit", "rename", "delete"]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorOut(BaseModel):
    error: ErrorBody


class PersonOut(BaseModel):
    user_id: str | None
    display_name: str | None
    avatar_url: str | None = None


class SignInOut(BaseModel):
    at: datetime
    browser: str


class AiUsesOut(BaseModel):
    # None means this server does not limit AI uses.
    limit: int | None
    used: int
    remaining: int | None
    resets_at: datetime


class EmailUsesOut(BaseModel):
    limit: int
    used: int
    remaining: int


class MeOut(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime
    mcp_url: str
    combine_enabled: bool
    draft_enabled: bool
    ai_uses: AiUsesOut
    # None means the person has no daily cap on instant update emails.
    instant_emails: EmailUsesOut | None = None
    about: str = ""
    avatar_url: str | None = None
    time_zone: str = "UTC"
    email_frequency: str = "instant"
    default_space_id: str | None = None
    last_sign_in: SignInOut | None = None
    plan: str = "free"
    billing_enabled: bool = False


class BillingOut(BaseModel):
    plan: str
    status: str
    period_end: datetime | None
    cancel_at_period_end: bool
    ai_pack_credits: int
    email_pack_credits: int
    can_manage: bool
    # A pack is sold only where the Free plan has the limit it tops up.
    ai_pack_available: bool
    email_pack_available: bool


class CheckoutIn(BaseModel):
    product: Product
    # A page to come back to after Stripe; checked in routes.billing.checkout_return_path.
    return_to: str | None = Field(default=None, max_length=300)


class PortalIn(BaseModel):
    # A page to come back to after the portal; checked in routes.billing.checkout_return_path.
    return_to: str | None = Field(default=None, max_length=300)


class UrlOut(BaseModel):
    url: str


class BillingPublicOut(BaseModel):
    enabled: bool


class MePatchIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    display_name: str | None = None
    about: str | None = None
    time_zone: str | None = None
    email_frequency: str | None = None
    default_space_id: str | None = None


class MemberOut(BaseModel):
    user_id: str
    display_name: str
    joined_at: datetime
    is_you: bool
    about: str = ""
    avatar_url: str | None = None


class HighlightOut(BaseModel):
    key: str
    value: str


class LatestItemOut(BaseModel):
    title: str
    kind: ItemKind
    via: str
    author_kind: AuthorKind
    shared_by_name: str | None
    created_at: datetime


class SpaceSummaryOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    is_creator: bool
    notify_email: bool
    members: list[MemberOut]
    owner_name: str | None
    last_activity_at: datetime
    note_count: int
    fact_count: int
    has_plan: bool
    highlights: list[HighlightOut]
    latest: LatestItemOut | None
    sources: list[str]
    new_count: int = 0


class SpaceLimitsOut(BaseModel):
    created_spaces: int
    max_created_spaces: int | None


class SpacesOut(BaseModel):
    spaces: list[SpaceSummaryOut]
    limits: SpaceLimitsOut


class TemplateFactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = ""
    hint: str = ""


class TemplateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = ""
    description: str = ""
    facts: list[TemplateFactIn] = []
    plan_sections: list[str] = []
    combine_hint: str = ""
    tips: list[str] = []


class TemplateFactOut(BaseModel):
    key: str
    hint: str


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    facts: list[TemplateFactOut]
    plan_sections: list[str]
    combine_hint: str
    tips: list[str]
    icon: str = ""


class TemplatesOut(BaseModel):
    templates: list[TemplateOut]


class DraftIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    purpose: str = ""


class DraftOut(BaseModel):
    template: TemplateOut
    drafted: bool


class SuggestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    purpose: str = ""


class SuggestedFactOut(BaseModel):
    key: str
    value: str


class SuggestOut(BaseModel):
    suggested: bool
    name: str
    template: TemplateOut
    base_template_id: str
    facts: list[SuggestedFactOut]


class CreateSpaceFactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = ""
    value: str = ""
    suggested: bool = False


class CreateSpaceIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = ""
    template_id: str | None = None
    template: TemplateIn | None = None
    facts: list[CreateSpaceFactIn] = Field(default=[], max_length=TEMPLATE_FACTS_MAX)


class FactOut(BaseModel):
    key: str
    value: str
    set_by: PersonOut | None
    via: str
    created_at: datetime


class ItemOut(BaseModel):
    id: str
    space_id: str
    kind: ItemKind
    title: str
    content: str
    author_kind: AuthorKind
    shared_by: PersonOut | None
    via: str
    created_at: datetime
    source_item_ids: list[str] | None
    can_retract: bool


class WaitingInviteOut(BaseModel):
    id: str
    email: str
    invited_by: str | None
    invited_at: datetime
    expires_at: datetime
    status: Literal["pending", "expired"]


class SpaceDetailOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    is_creator: bool
    notify_email: bool
    members: list[MemberOut]
    memory: list[FactOut]
    template: TemplateOut
    unset_facts: list[TemplateFactOut]
    latest_plan: ItemOut | None
    invites: list[WaitingInviteOut] = []


class ItemsPageOut(BaseModel):
    items: list[ItemOut]
    next_before: str | None


class ShareIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = ""
    content: str = ""


class FactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = ""
    value: str = ""


class FactResultOut(BaseModel):
    fact: FactOut
    replaced_value: str | None
    changed: bool


class FactRenameIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = ""
    new_key: str = ""


class FactEventOut(BaseModel):
    action: FactAction
    key: str
    previous_key: str | None
    value: str
    previous_value: str | None
    by: PersonOut | None
    via: str
    at: datetime


class FactHistoryOut(BaseModel):
    entries: list[FactEventOut]


class MembershipPatchIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    notify_email: bool


class MembershipOut(BaseModel):
    notify_email: bool


class CombineIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    instruction: str | None = None


class CombineOut(BaseModel):
    item: ItemOut
    created: bool


class InviteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: str | None = None


class InviteCreatedOut(BaseModel):
    url: str
    expires_at: datetime
    emailed: bool


class InviteViewOut(BaseModel):
    status: InviteStatus
    space_name: str
    invited_by: str | None
    expires_at: datetime
    signed_in: bool
    already_member: bool
    inviter_avatar_url: str | None = None


class AcceptOut(BaseModel):
    space_id: str
    already_member: bool


class InvitationOut(BaseModel):
    id: str
    space_name: str
    invited_by: str | None
    invited_at: datetime
    expires_at: datetime


class InvitationsOut(BaseModel):
    invitations: list[InvitationOut]


class ConnectionOut(BaseModel):
    id: str
    client_name: str
    client_host: str
    connected_at: datetime


class ConnectionsOut(BaseModel):
    connections: list[ConnectionOut]


class DemoPersonOut(BaseModel):
    key: str
    name: str


class DemoOut(BaseModel):
    enabled: bool
    people: list[DemoPersonOut]
