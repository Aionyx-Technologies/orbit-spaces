import type { Item, ItemsPage } from "@/lib/api.types";
import type { FeedState } from "@/lib/feed-merge.types";

export function compareItems(left: Item, right: Item): number {
  const byTime = Date.parse(right.created_at) - Date.parse(left.created_at);
  if (byTime !== 0) {
    return byTime;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? 1 : -1;
}

function sortedUnique(items: Item[]): Item[] {
  const seen = new Set<string>();
  const unique: Item[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique.sort(compareItems);
}

export function initialFeedState(page: ItemsPage): FeedState {
  return { items: page.items, nextBefore: page.next_before, extended: false };
}

export function applyFirstPage(state: FeedState, page: ItemsPage): FeedState {
  if (page.next_before === null) {
    return { items: page.items, nextBefore: null, extended: state.extended };
  }
  const boundary = page.items[page.items.length - 1];
  const older = boundary ? state.items.filter((item) => compareItems(item, boundary) > 0) : [];
  return {
    items: sortedUnique([...page.items, ...older]),
    nextBefore: state.extended ? state.nextBefore : page.next_before,
    extended: state.extended,
  };
}

export function applyOlderPage(state: FeedState, page: ItemsPage): FeedState {
  return {
    items: sortedUnique([...state.items, ...page.items]),
    nextBefore: page.next_before,
    extended: true,
  };
}

export function addItem(state: FeedState, item: Item): FeedState {
  return { ...state, items: sortedUnique([item, ...state.items]) };
}

export function removeItem(state: FeedState, itemId: string): FeedState {
  return { ...state, items: state.items.filter((item) => item.id !== itemId) };
}
