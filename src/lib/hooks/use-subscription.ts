"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import {
  TIERS,
  type TierName,
  type TierLimits,
  isReportAvailable as checkReport,
  reportRequiredTier,
  featureRequiredTier,
  FREE_REPORT_IDS,
  STARTER_REPORT_IDS,
} from "@/lib/subscription-tiers";

export type FeatureKey = keyof TierLimits["features"];

export interface LimitCheck {
  atLimit: boolean;
  current: number;
  max: number; // -1 = unlimited
}

/**
 * Hook to access the current group's subscription tier + limit checks.
 * All existing groups default to 'free' until a subscription row exists.
 */
export function useSubscription() {
  const { groupId, currentGroup, user } = useGroup();
  const t = useTranslations("tiers");
  const locale = useLocale();

  // ── Read tier from group_subscriptions (best-effort) ────────────────
  const { data: tierData } = useQuery({
    queryKey: ["group-subscription", groupId],
    queryFn: async () => {
      if (!groupId) return "free" as TierName;
      const supabase = createClient();
      const { data } = await supabase
        .from("group_subscriptions")
        .select("tier")
        .eq("group_id", groupId)
        .maybeSingle();
      return ((data?.tier as TierName) || "free") as TierName;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // cache 5 min
    // If the table doesn't exist yet, gracefully default to free
    retry: false,
  });

  const tier: TierName = tierData || "free";
  const limits: TierLimits = TIERS[tier];

  // ── Resource counts (cached 60s) ────────────────────────────────────
  const { data: resourceCounts } = useQuery({
    queryKey: ["resource-counts", groupId],
    queryFn: async () => {
      if (!groupId) return { members: 0, contributionTypes: 0, documents: 0, reliefPlans: 0, savingsCycles: 0 };
      const supabase = createClient();
      const [membersRes, ctRes, docsRes, reliefRes, savingsRes] = await Promise.all([
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("contribution_types").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("is_active", true),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("relief_plans").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("savings_cycles").select("id", { count: "exact", head: true }).eq("group_id", groupId),
      ]);
      return {
        members: membersRes.count || 0,
        contributionTypes: ctRes.count || 0,
        documents: docsRes.count || 0,
        reliefPlans: reliefRes.count || 0,
        savingsCycles: savingsRes.count || 0,
      };
    },
    enabled: !!groupId,
    staleTime: 60_000,
  });

  // ── User's total groups count ───────────────────────────────────────
  const { data: userGroupCount } = useQuery({
    queryKey: ["user-group-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const supabase = createClient();
      const { count } = await supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const counts = resourceCounts || { members: 0, contributionTypes: 0, documents: 0, reliefPlans: 0, savingsCycles: 0 };

  // ── Helper functions ────────────────────────────────────────────────

  function canUseFeature(feature: FeatureKey): boolean {
    return limits.features[feature];
  }

  function isAtLimit(resource: "members" | "contributionTypes" | "documents" | "reliefPlans" | "savingsCycles" | "groups"): LimitCheck {
    const limitMap: Record<string, { current: number; max: number }> = {
      members: { current: counts.members, max: limits.maxMembers },
      contributionTypes: { current: counts.contributionTypes, max: limits.maxContributionTypes },
      documents: { current: counts.documents, max: limits.maxDocuments },
      reliefPlans: { current: counts.reliefPlans, max: limits.maxReliefPlans },
      savingsCycles: { current: counts.savingsCycles, max: limits.maxSavingsCycles },
      groups: { current: userGroupCount || 0, max: limits.maxGroupsPerUser },
    };

    const entry = limitMap[resource];
    if (!entry) return { atLimit: false, current: 0, max: -1 };
    if (entry.max === -1) return { atLimit: false, current: entry.current, max: -1 };
    return {
      atLimit: entry.current >= entry.max,
      current: entry.current,
      max: entry.max,
    };
  }

  function isReportAvailable(reportId: string): boolean {
    return checkReport(reportId, tier);
  }

  function getReportRequiredTier(reportId: string): TierName {
    return reportRequiredTier(reportId);
  }

  function getFeatureRequiredTier(feature: FeatureKey): TierName {
    return featureRequiredTier(feature);
  }

  const isFreeTier = tier === "free";
  const isStarterTier = tier === "starter";
  const isProTier = tier === "pro";
  const isEnterprise = tier === "enterprise";
  const pricingUrl = `/${locale}/pricing`;

  // Currency for pricing display — XAF/XOF-based groups see FCFA prices
  const currency = currentGroup?.currency || "USD";
  const useXafPricing = ["XAF", "XOF"].includes(currency);

  return {
    tier,
    limits,
    canUseFeature,
    isAtLimit,
    isReportAvailable,
    getReportRequiredTier,
    getFeatureRequiredTier,
    isFreeTier,
    isStarterTier,
    isProTier,
    isEnterprise,
    pricingUrl,
    counts,
    userGroupCount: userGroupCount || 0,
    useXafPricing,
    FREE_REPORT_IDS,
    STARTER_REPORT_IDS,
  };
}
