import type { SWRConfiguration } from "swr";

import { ApiError } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";

export const MAX_RETRIES = 3;
export const RETRY_BASE_MS = 2_000;

export const swrOptions: SWRConfiguration = {
  onError: (error: unknown) => {
    redirectIfUnauthenticated(error);
  },
  onErrorRetry: (error: unknown, _key, _config, revalidate, { retryCount }) => {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return;
    }
    if (retryCount >= MAX_RETRIES) {
      return;
    }
    setTimeout(() => void revalidate({ retryCount }), RETRY_BASE_MS * 2 ** retryCount);
  },
};
