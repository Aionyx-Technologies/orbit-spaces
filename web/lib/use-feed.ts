import { useCallback, useEffect, useRef, useState } from "react";

import { api, describeError } from "@/lib/api";
import type { Item, ItemsPage } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import {
  addItem,
  applyFirstPage,
  applyOlderPage,
  initialFeedState,
  removeItem,
} from "@/lib/feed-merge";
import type { FeedState } from "@/lib/feed-merge.types";
import type { UseFeed } from "@/lib/use-feed.types";

export function useFeed(spaceId: string, initial: ItemsPage): UseFeed {
  const [state, setState] = useState<FeedState>(() => initialFeedState(initial));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set(initial.items.map((item) => item.id)));
  const cursor = state.nextBefore;

  useEffect(() => {
    knownIds.current = new Set(state.items.map((item) => item.id));
  }, [state.items]);

  const refresh = useCallback(async () => {
    try {
      const page = await api.items.list(spaceId, { limit: FEED_PAGE_SIZE });
      const arrived = page.items.filter((item) => !knownIds.current.has(item.id));
      setState((current) => applyFirstPage(current, page));
      return arrived.map((item) => item.id);
    } catch (failure) {
      redirectIfUnauthenticated(failure);
      return [];
    }
  }, [spaceId]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.items.list(spaceId, { before: cursor, limit: FEED_PAGE_SIZE });
      setState((current) => applyOlderPage(current, page));
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, spaceId]);

  const add = useCallback((item: Item) => {
    setState((current) => addItem(current, item));
  }, []);

  const remove = useCallback((itemId: string) => {
    setState((current) => removeItem(current, itemId));
  }, []);

  return {
    items: state.items,
    hasMore: cursor !== null,
    loadingMore,
    error,
    loadMore,
    refresh,
    add,
    remove,
  };
}
