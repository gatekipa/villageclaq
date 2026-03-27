"use client";

import { useQuery } from "@tanstack/react-query";
import { calculateStanding, type StandingResult } from "@/lib/calculate-standing";

/**
 * Hook that auto-calculates a member's standing from real data.
 * Caches for 5 minutes.
 */
export function useMemberStanding(membershipId: string | null, groupId: string | null) {
  return useQuery<StandingResult | null>({
    queryKey: ["member-standing", membershipId, groupId],
    queryFn: async () => {
      if (!membershipId || !groupId) return null;
      return calculateStanding(membershipId, groupId);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!membershipId && !!groupId,
  });
}
