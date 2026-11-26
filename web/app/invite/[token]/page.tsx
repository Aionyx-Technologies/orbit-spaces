import type { Metadata } from "next";

import type { InvitePageProps } from "@/app/invite/[token]/page.types";
import { InviteScreen } from "@/components/invite/invite-screen";
import { InviteShell } from "@/components/invite/invite-shell";
import { InviteUnavailable } from "@/components/invite/invite-unavailable";
import type { InviteView } from "@/lib/api.types";
import { serverRequest } from "@/lib/server-api";

export const metadata: Metadata = { title: "You're invited" };

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const result = await serverRequest<InviteView>(`/api/invites/${encodeURIComponent(token)}`);
  return (
    <InviteShell>
      {result.ok ? (
        <InviteScreen token={token} invite={result.data} />
      ) : (
        <InviteUnavailable problem={result.status === 404 ? "not_found" : "error"} />
      )}
    </InviteShell>
  );
}
