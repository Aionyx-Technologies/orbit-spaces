"use client";

import { SWRConfig } from "swr";

import type { ProvidersProps } from "@/components/providers.types";
import { Toaster } from "@/components/ui/sonner";
import { swrOptions } from "@/lib/swr-options";

export function Providers({ children }: ProvidersProps) {
  return (
    <SWRConfig value={swrOptions}>
      {children}
      <Toaster />
    </SWRConfig>
  );
}
