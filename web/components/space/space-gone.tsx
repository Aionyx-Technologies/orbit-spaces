import { OrbitIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function SpaceGone() {
  return (
    <Card>
      <EmptyState
        icon={<OrbitIcon aria-hidden="true" />}
        title="This space isn't available"
        headingLevel={1}
        action={
          <Link href="/spaces" className={buttonVariants()}>
            Back to your spaces
          </Link>
        }
      >
        It may have been deleted, or you may no longer be a member.
      </EmptyState>
    </Card>
  );
}
