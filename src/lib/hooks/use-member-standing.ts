"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateStanding, type StandingResult } from "@/lib/calculate-standing";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook that returns a member's standing breakdown.
 *
 * READ-ONLY: this always computes with `updateDb: false`, so passively viewing
 * a member NEVER writes standing and NEVER dispatches a notification. (The old
 * implementation persisted-on-render and could fire a standing-change
 * notification just from rendering a stale member — that side effect is gone.)
 *
 * Writes happen ONLY through `useRecalculateStanding()`, invoked by an explicit
 * admin action.
 */
export function useMemberStanding(
  membershipId: string | null,
  groupId: string | null,
  currency?: string,
) {
  return useQuery<StandingResult | null>({
    queryKey: ["member-standing", membershipId, groupId, currency],
    queryFn: async () => {
      if (!membershipId || !groupId) return null;
      return calculateStanding(membershipId, groupId, {
        updateDb: false,
        currency,
      });
    },
    staleTime: STALE_THRESHOLD_MS,
    enabled: !!membershipId && !!groupId,
  });
}

/**
 * Hook that returns a member's full standing breakdown (every reason).
 *
 * READ-ONLY: computes with `updateDb: false`. Use on the member detail page for
 * the breakdown. `currency` is part of the query key so a currency change
 * re-renders the money-formatted reasons (previously omitted — fixed here).
 */
export function useMemberStandingDetailed(
  membershipId: string | null,
  groupId: string | null,
  currency?: string,
) {
  return useQuery<StandingResult | null>({
    queryKey: ["member-standing-detailed", membershipId, groupId, currency],
    queryFn: async () => {
      if (!membershipId || !groupId) return null;
      return calculateStanding(membershipId, groupId, {
        updateDb: false,
        currency,
      });
    },
    staleTime: STALE_THRESHOLD_MS,
    enabled: !!membershipId && !!groupId,
  });
}

/**
 * Mutation hook that recalculates AND persists a member's standing, and may
 * dispatch a standing-change notification on a real transition.
 *
 * This is the ONLY hook that writes/notifies, and it does so ONLY when its
 * `mutate`/`mutateAsync` is explicitly invoked (e.g. an admin "Recalculate"
 * button). On success it invalidates both standing query keys so the read hooks
 * pick up the persisted value.
 */
export function useRecalculateStanding() {
  const queryClient = useQueryClient();

  return useMutation<
    StandingResult,
    Error,
    { membershipId: string; groupId: string; currency?: string }
  >({
    mutationFn: ({ membershipId, groupId, currency }) =>
      calculateStanding(membershipId, groupId, { updateDb: true, currency }),
    onSuccess: (_data, { membershipId, groupId }) => {
      queryClient.invalidateQueries({
        queryKey: ["member-standing", membershipId, groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["member-standing-detailed", membershipId, groupId],
      });
    },
  });
}
