import type { Me } from "@/lib/api.types";

export type ProfileSectionProps = Readonly<{
  me: Pick<Me, "display_name" | "email" | "about" | "avatar_url">;
}>;
