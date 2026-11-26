"use client";

import { SWRConfig } from "swr";

import type { ScreenCacheProps } from "@/components/common/screen-cache.types";

function createCache() {
  return new Map();
}

export function ScreenCache({ children }: ScreenCacheProps) {
  return <SWRConfig value={{ provider: createCache }}>{children}</SWRConfig>;
}
