"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import type { ErrorPageProps } from "@/app/error.types";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="flex justify-center">
        <Logo />
      </div>
      <EmptyState
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title="Something went wrong"
        headingLevel={1}
        action={
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        }
      >
        Orbit hit a problem loading this page. Your data is safe. Try again in a moment.
      </EmptyState>
    </main>
  );
}
