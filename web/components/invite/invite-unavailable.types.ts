export type InviteProblem = "not_found" | "error" | "expired" | "used" | "revoked";

export type InviteUnavailableProps = Readonly<{
  problem: InviteProblem;
  inviter?: string | null;
}>;
