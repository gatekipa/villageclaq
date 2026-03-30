"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { calculateStanding, type StandingResult } from "@/lib/calculate-standing";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook that returns a member's standing.
 *
 * Strategy:
 * 1. Read the stored standing + standing_updated_at from the memberships row.
 * 2. If standing_updated_at is within the last 5 minutes, return the stored value
 *    (avoids 4+ Supabase queries per render).
 * 3. Otherwise, recalculate from scratch, persist the result to DB, and return it.
 */
export function useMemberStanding(membershipId: string | null, groupId: string | null) {
  return useQuery<StandingResult | null>({
    queryKey: ["member-standing", membershipId, groupId],
    queryFn: async () => {
      if (!membershipId || !groupId) return null;

      // Step 1: Try reading cached standing from DB
      const supabase = createClient();
      const { data: membership } = await supabase
        .from("memberships")
        .select("standing, standing_updated_at")
        .eq("id", membershipId)
        .single();

      if (membership?.standing_updated_at) {
        const updatedAt = new Date(membership.standing_updated_at).getTime();
        const age = Date.now() - updatedAt;

        if (age < STALE_THRESHOLD_MS && membership.standing) {
          // DB value is fresh enough — return it without full recalculation
          // We return a minimal StandingResult; the full reasons are only
          // needed for detail views, which can call calculateStanding directly
          return {
            standing: membership.standing as StandingResult["standing"],
            reasons: [],
            score: membership.standing === "good" ? 100 : membership.standing === "warning" ? 75 : 25,
          };
        }
      }

      // Step 2: Stale or missing — recalculate and persist
      return calculateStanding(membershipId, groupId, { updateDb: true });
    },
    staleTime: STALE_THRESHOLD_MS,
    enabled: !!membershipId && !!groupId,
  });
}

/**
 * Hook that always does a full recalculation with detailed reasons.
 * Use this for the member detail page where you need the breakdown.
 */
export function useMemberStandingDetailed(membershipId: string | null, groupId: string | null, currency?: string) {
  return useQuery<StandingResult | null>({
    queryKey: ["member-standing-detailed", membershipId, groupId],
    queryFn: async () => {
      if (!membershipId || !groupId) return null;
      return calculateStanding(membershipId, groupId, { updateDb: true, currency });
    },
    staleTime: STALE_THRESHOLD_MS,
    enabled: !!membershipId && !!groupId,
  });
}
