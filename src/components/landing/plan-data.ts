import { FREE_REPORT_IDS, STARTER_REPORT_IDS, TIERS, type TierName } from "@/lib/subscription-tiers";

// Public pricing is derived from TIERS so prices and limits cannot drift from
// the plan configuration. The comparison covers the plan features the product
// gates (database trigger, FeatureLock or report lock) plus their configured
// allowances; other configured caps (documents, events per month, groups per
// account) stay off the page. Enforcement gaps are tracked as billing follow-ups.

export const PLAN_ORDER: TierName[] = ["free", "starter", "pro", "enterprise"];

export type CompareValue =
  | { kind: "check"; included: boolean }
  | { kind: "count"; count: number }
  | { kind: "unlimited" }
  | { kind: "upTo"; count: number }
  | { kind: "reportsCore"; count: number }
  | { kind: "all" };

export type CompareRowKey =
  | "members"
  | "contributionTypes"
  | "reports"
  | "fines"
  | "savings"
  | "relief"
  | "committees"
  | "loans"
  | "elections"
  | "ai";

function limit(max: number): CompareValue {
  return max === -1 ? { kind: "unlimited" } : { kind: "count", count: max };
}

function reports(tier: TierName): CompareValue {
  if (tier === "free") return { kind: "reportsCore", count: FREE_REPORT_IDS.length };
  if (tier === "starter") return { kind: "count", count: STARTER_REPORT_IDS.length };
  return { kind: "all" };
}

/** A gated feature with a configured allowance: not included, "up to N" or unlimited. */
function allowance(included: boolean, max: number): CompareValue {
  if (!included) return { kind: "check", included: false };
  return max === -1 ? { kind: "unlimited" } : { kind: "upTo", count: max };
}

const check = (included: boolean): CompareValue => ({ kind: "check", included });

export const COMPARE_ROWS: { key: CompareRowKey; value: (tier: TierName) => CompareValue }[] = [
  { key: "members", value: (tier) => limit(TIERS[tier].maxMembers) },
  { key: "contributionTypes", value: (tier) => limit(TIERS[tier].maxContributionTypes) },
  { key: "reports", value: reports },
  { key: "fines", value: (tier) => check(TIERS[tier].features.fines) },
  { key: "savings", value: (tier) => allowance(TIERS[tier].features.savingsCircle, TIERS[tier].maxSavingsCycles) },
  { key: "relief", value: (tier) => allowance(TIERS[tier].features.reliefPlans, TIERS[tier].maxReliefPlans) },
  { key: "committees", value: (tier) => check(TIERS[tier].features.committees) },
  { key: "loans", value: (tier) => check(TIERS[tier].features.loans) },
  { key: "elections", value: (tier) => check(TIERS[tier].features.elections) },
  { key: "ai", value: (tier) => check(TIERS[tier].features.aiInsights) },
];

export function planPrices(tier: TierName) {
  return TIERS[tier].price;
}

export function planLimits(tier: TierName) {
  const plan = TIERS[tier];
  return {
    maxMembers: plan.maxMembers,
    maxContributionTypes: plan.maxContributionTypes,
    maxReliefPlans: plan.maxReliefPlans,
    maxSavingsCycles: plan.maxSavingsCycles,
    freeReports: FREE_REPORT_IDS.length,
    starterReports: STARTER_REPORT_IDS.length,
  };
}
