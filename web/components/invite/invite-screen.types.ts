import type { InviteView } from "@/lib/api.types";

export type InviteScreenProps = Readonly<{
  token: string;
  invite: InviteView;
}>;
