import { useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

import {
  BILLING_KEY,
  fetcher,
  INVITATIONS_KEY,
  ME_KEY,
  SPACES_KEY,
  spaceKey,
  TEMPLATES_KEY,
} from "@/lib/api";
import type {
  Billing,
  ConnectionsResponse,
  InvitationsResponse,
  Me,
  PlanSummary,
  SpaceDetail,
  SpacesResponse,
  TemplatesResponse,
} from "@/lib/api.types";
import { withoutInvitation } from "@/lib/invitations";

const SERVER_RENDERED = { revalidateOnMount: false } as const;

export const HOME_REFRESH_MS = 30_000;

export function useSpaces(initial: SpacesResponse) {
  return useSWR<SpacesResponse>(SPACES_KEY, fetcher, {
    fallbackData: initial,
    refreshInterval: HOME_REFRESH_MS,
    ...SERVER_RENDERED,
  });
}

export function useInvitations(initial: InvitationsResponse) {
  const { data, error, mutate } = useSWR<InvitationsResponse>(INVITATIONS_KEY, fetcher, {
    fallbackData: initial,
    refreshInterval: HOME_REFRESH_MS,
    ...SERVER_RENDERED,
  });
  const invitations = data ?? initial;
  const onScreen = useRef(invitations);

  useEffect(() => {
    onScreen.current = invitations;
  }, [invitations]);

  const forget = useCallback(
    (invitationId: string) =>
      mutate((current) => withoutInvitation(current ?? onScreen.current, invitationId), {
        revalidate: false,
      }),
    [mutate],
  );

  return { invitations, error, forget, refresh: mutate };
}

export function useSpace(spaceId: string, initial: SpaceDetail) {
  const { data, error, mutate } = useSWR<SpaceDetail>(spaceKey(spaceId), fetcher, {
    fallbackData: initial,
    ...SERVER_RENDERED,
  });
  const space = data ?? initial;
  const onScreen = useRef(space);

  useEffect(() => {
    onScreen.current = space;
  }, [space]);

  const update = useCallback(
    (change: (current: SpaceDetail) => SpaceDetail) =>
      mutate((current) => change(current ?? onScreen.current), { revalidate: false }),
    [mutate],
  );

  return { space, error, refresh: mutate, update };
}

const STATIC_DATA = { revalidateOnFocus: false, revalidateOnReconnect: false } as const;

export function useTemplates(active: boolean) {
  return useSWR<TemplatesResponse>(active ? TEMPLATES_KEY : null, fetcher, STATIC_DATA);
}

export function useMe(active: boolean) {
  return useSWR<Me>(active ? ME_KEY : null, fetcher, STATIC_DATA);
}

// The numbers behind the plan chip and the Billing card: the page's own copy first, then fresh.
export function useLiveMe(initial: PlanSummary): PlanSummary {
  const { data } = useMe(initial.billing_enabled);
  return data ?? initial;
}

export function useBilling(active: boolean) {
  return useSWR<Billing>(active ? BILLING_KEY : null, fetcher, STATIC_DATA);
}

export function useConnections(initial: ConnectionsResponse) {
  return useSWR<ConnectionsResponse>("/api/connections", fetcher, {
    fallbackData: initial,
    ...SERVER_RENDERED,
  });
}
