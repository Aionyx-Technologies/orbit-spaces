import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="flex justify-center">
        <Logo />
      </div>
      <EmptyState
        icon={<CompassIcon aria-hidden="true" />}
        title="We can't find that page"
        headingLevel={1}
        action={
          <Link href="/" className={buttonVariants()}>
            Go to Orbit
          </Link>
        }
      >
        The link may be old or mistyped.
      </EmptyState>
    </main>
  );
}
