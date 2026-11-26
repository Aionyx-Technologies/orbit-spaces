import type { Me } from "@/lib/api.types";

export type NavSection = "spaces" | "assistants" | "settings";

export type AppHeaderProps = Readonly<{
  me: Pick<Me, "display_name" | "email"> &
    Partial<Pick<Me, "avatar_url" | "plan" | "billing_enabled" | "ai_uses" | "instant_emails">>;
  current: NavSection | null;
}>;
