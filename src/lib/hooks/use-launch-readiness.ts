"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import type { LaunchReadinessInputs } from "@/lib/launch-readiness";

/**
 * Client hook that gathers the launch-readiness inputs for the current group.
 *
 * Mirrors the dashboard's readiness counts EXACTLY (see
 * src/app/[locale]/(dashboard)/dashboard/page.tsx):
 * - active non-proxy member count (proxies are admin-created and must not
 *   mark "first member joined" done by themselves)
 * - total invitation count (any status — sent or staged)
 * - event count and active contribution-type count
 * - groupProfileComplete from currentGroup name + currency
 * - adminContactReady as a boolean presence check of the profile phone —
 *   the phone value itself is never rendered or logged (rule 11)
 *
 * Admin-only by design: the query is disabled for non-admins and the hook
 * returns null inputs so callers can show a friendly non-admin state.
 */
export function useLaunchReadinessInputs(): {
  inputs: LaunchReadinessInputs | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { groupId, currentGroup, user, isAdmin } = useGroup();

  const { data: counts, isLoading, error, refetch } = useQuery({
    queryKey: ["launch-readiness-inputs", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const [activeRes, invitationsRes, eventsRes, contributionTypesRes] = await Promise.all([
        // Real (non-proxy) active members — same shape as the dashboard's
        // member-count query so both surfaces agree on "first member joined".
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("membership_status", "active").eq("is_proxy", false),
        supabase.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        // Active types only — mirrors useContributionTypes(), which the
        // dashboard's readiness card counts from.
        supabase.from("contribution_types").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("is_active", true),
      ]);
      // THROW on failure so React Query reports an error and the page shows
      // a retryable error state — coercing to 0 would render a half-finished
      // launch picture on a fully set up group (dashboards must not lie).
      for (const res of [activeRes, invitationsRes, eventsRes, contributionTypesRes]) {
        if (res.error) {
          console.warn("[LaunchReadiness] count query failed:", res.error.message);
          throw res.error;
        }
      }
      return {
        activeNonProxyCount: activeRes.count ?? 0,
        invitationCount: invitationsRes.count ?? 0,
        eventCount: eventsRes.count ?? 0,
        contributionTypeCount: contributionTypesRes.count ?? 0,
      };
    },
    enabled: !!groupId && isAdmin,
    staleTime: 60_000,
  });

  // Extract primitives before using them in memo deps (rule 9: no raw
  // objects in dependency arrays).
  const groupProfileComplete = !!(currentGroup?.name && currentGroup?.currency);
  // Boolean presence check only — never expose the phone value itself.
  const adminContactReady = !!user?.phone;
  const activeNonProxyCount = counts?.activeNonProxyCount;
  const invitationCount = counts?.invitationCount;
  const eventCount = counts?.eventCount;
  const contributionTypeCount = counts?.contributionTypeCount;

  const inputs = useMemo<LaunchReadinessInputs | null>(() => {
    if (
      activeNonProxyCount === undefined ||
      invitationCount === undefined ||
      eventCount === undefined ||
      contributionTypeCount === undefined
    ) {
      return null;
    }
    return {
      groupProfileComplete,
      adminContactReady,
      invitationCount,
      // The owner holds an active membership but does not count as a
      // "joined member" — same convention as the dashboard.
      acceptedMemberCount: Math.max(0, activeNonProxyCount - 1),
      contributionTypeCount,
      eventCount,
    };
  }, [groupProfileComplete, adminContactReady, invitationCount, activeNonProxyCount, contributionTypeCount, eventCount]);

  return { inputs, isLoading, error: error ?? null, refetch };
}
