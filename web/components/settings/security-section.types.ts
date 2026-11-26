import type { Me } from "@/lib/api.types";

export type SecuritySectionProps = Readonly<{
  me: Pick<Me, "last_sign_in" | "time_zone">;
}>;
