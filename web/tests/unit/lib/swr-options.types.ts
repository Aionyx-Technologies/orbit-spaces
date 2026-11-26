import type { swrOptions } from "@/lib/swr-options";

export type RetryArgs = Parameters<NonNullable<typeof swrOptions.onErrorRetry>>;
