export type TierName = "free" | "starter" | "pro" | "enterprise";

export interface TierLimits {
  name: string;
  nameKey: string; // i18n key for display name
  price: {
    usd: { monthly: number; yearly: number };
    xaf: { monthly: number; yearly: number };
  };
  maxMembers: number; // -1 = unlimited
  maxGroupsPerUser: number; // -1 = unlimited
  maxContributionTypes: number; // -1 = unlimited
  maxEventsPerMonth: number; // -1 = unlimited
  maxDocuments: number; // -1 = unlimited
  maxReliefPlans: number; // -1 = unlimited
  maxSavingsCycles: number; // -1 = unlimited
  maxWhatsappPerDay: number; // -1 = unlimited
  features: {
    pdfExport: boolean;
    csvExport: boolean;
    allReports: boolean; // false = limited reports only
    aiInsights: boolean;
    loans: boolean;
    committees: boolean;
    smsNotifications: boolean;
    boardPacket: boolean;
    subGroups: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    reliefPlans: boolean;
    savingsCircle: boolean;
    elections: boolean;
    fines: boolean;
  };
}

export const TIERS: Record<TierName, TierLimits> = {
  free: {
    name: "Free",
    nameKey: "tiers.free",
    price: {
      usd: { monthly: 0, yearly: 0 },
      xaf: { monthly: 0, yearly: 0 },
    },
    maxMembers: 15,
    maxGroupsPerUser: 1,
    maxContributionTypes: 2,
    maxEventsPerMonth: 5,
    maxDocuments: 3,
    maxReliefPlans: 0,
    maxSavingsCycles: 0,
    maxWhatsappPerDay: 3,
    features: {
      pdfExport: true,
      csvExport: false,
      allReports: false,
      aiInsights: false,
      loans: false,
      committees: false,
      smsNotifications: false,
      boardPacket: false,
      subGroups: false,
      customBranding: false,
      prioritySupport: false,
      reliefPlans: false,
      savingsCircle: false,
      elections: false,
      fines: false,
    },
  },
  starter: {
    name: "Starter",
    nameKey: "tiers.starter",
    price: {
      usd: { monthly: 5, yearly: 49 },
      xaf: { monthly: 2500, yearly: 25000 },
    },
    maxMembers: 50,
    maxGroupsPerUser: 3,
    maxContributionTypes: 5,
    maxEventsPerMonth: 20,
    maxDocuments: 20,
    maxReliefPlans: 2,
    maxSavingsCycles: 1,
    maxWhatsappPerDay: 10,
    features: {
      pdfExport: true,
      csvExport: true,
      allReports: false, // 10 reports, not all
      aiInsights: false,
      loans: false,
      committees: true,
      smsNotifications: false,
      boardPacket: false,
      subGroups: false,
      customBranding: false,
      prioritySupport: false,
      reliefPlans: true,
      savingsCircle: true,
      elections: false,
      fines: true,
    },
  },
  pro: {
    name: "Pro",
    nameKey: "tiers.pro",
    price: {
      usd: { monthly: 15, yearly: 149 },
      xaf: { monthly: 7500, yearly: 75000 },
    },
    maxMembers: 200,
    maxGroupsPerUser: 10,
    maxContributionTypes: -1,
    maxEventsPerMonth: -1,
    maxDocuments: -1,
    maxReliefPlans: -1,
    maxSavingsCycles: -1,
    maxWhatsappPerDay: -1,
    features: {
      pdfExport: true,
      csvExport: true,
      allReports: true,
      aiInsights: true,
      loans: true,
      committees: true,
      smsNotifications: true,
      boardPacket: true,
      subGroups: false,
      customBranding: false,
      prioritySupport: true,
      reliefPlans: true,
      savingsCircle: true,
      elections: true,
      fines: true,
    },
  },
  enterprise: {
    name: "Enterprise",
    nameKey: "tiers.enterprise",
    price: {
      usd: { monthly: 40, yearly: 399 },
      xaf: { monthly: 20000, yearly: 200000 },
    },
    maxMembers: -1,
    maxGroupsPerUser: -1,
    maxContributionTypes: -1,
    maxEventsPerMonth: -1,
    maxDocuments: -1,
    maxReliefPlans: -1,
    maxSavingsCycles: -1,
    maxWhatsappPerDay: -1,
    features: {
      pdfExport: true,
      csvExport: true,
      allReports: true,
      aiInsights: true,
      loans: true,
      committees: true,
      smsNotifications: true,
      boardPacket: true,
      subGroups: true,
      customBranding: true,
      prioritySupport: true,
      reliefPlans: true,
      savingsCircle: true,
      elections: true,
      fines: true,
    },
  },
};

/** The 2 basic reports available on the Free tier */
export const FREE_REPORT_IDS = [
  "8", // Who Hasn't Paid / Members roster
  "6", // Member Standing
];

/** The 10 reports available on the Starter tier */
export const STARTER_REPORT_IDS = [
  "1", // Financial Summary
  "2", // Revenue Breakdown
  "3", // Contribution Ledger
  "4", // Outstanding Balances
  "6", // Member Standing
  "8", // Who Hasn't Paid
  "9", // Member Growth
  "11", // Attendance Summary
  "12", // Event Participation
  "15", // Relief Claims
];

/** Check if a report ID is available on the given tier */
export function isReportAvailable(reportId: string, tier: TierName): boolean {
  if (tier === "free") return FREE_REPORT_IDS.includes(reportId);
  if (tier === "starter") return STARTER_REPORT_IDS.includes(reportId);
  // pro + enterprise get all reports
  return true;
}

/**
 * Returns the minimum tier required to unlock a given report.
 * Useful for showing "Starter" vs "Pro" badge on locked reports.
 */
export function reportRequiredTier(reportId: string): TierName {
  if (FREE_REPORT_IDS.includes(reportId)) return "free";
  if (STARTER_REPORT_IDS.includes(reportId)) return "starter";
  return "pro";
}

/** Feature display lists for pricing pages — sourced from TIERS config */
export function getTierFeatures(tier: TierName): string[] {
  const t = TIERS[tier];
  const features: string[] = [];

  if (tier === "free") {
    features.push(`tierFeatureMembers|${t.maxMembers}`);
    features.push(`tierFeatureContribTypes|${t.maxContributionTypes}`);
    features.push("tierFeatureBasicReports2");
    features.push("tierFeatureWhatsappEmail");
    features.push(`tierFeatureEvents|${t.maxEventsPerMonth}`);
    features.push(`tierFeatureGroups|${t.maxGroupsPerUser}`);
  } else if (tier === "starter") {
    features.push(`tierFeatureMembers|${t.maxMembers}`);
    features.push(`tierFeatureContribTypes|${t.maxContributionTypes}`);
    features.push("tierFeatureStarterReports");
    features.push("tierFeatureReliefSavings");
    features.push("tierFeatureElectionsFines");
    features.push("tierFeatureCsvExport");
  } else if (tier === "pro") {
    features.push(`tierFeatureMembers|${t.maxMembers}`);
    features.push("tierFeatureUnlimitedContribTypes");
    features.push("tierFeatureAllReportsAI");
    features.push("tierFeatureLoansCommittees");
    features.push("tierFeatureSmsUnlimitedWa");
    features.push("tierFeaturePrioritySupport");
  } else {
    features.push("tierFeatureUnlimitedMembers");
    features.push("tierFeatureEverythingPro");
    features.push("tierFeatureSubGroups");
    features.push("tierFeatureCustomBranding");
    features.push("tierFeatureDedicatedSupport");
  }

  return features;
}

/**
 * Determine the minimum tier that unlocks a given feature.
 */
export function featureRequiredTier(feature: keyof TierLimits["features"]): TierName {
  // Check tiers from lowest to highest
  const tierOrder: TierName[] = ["free", "starter", "pro", "enterprise"];
  for (const t of tierOrder) {
    if (TIERS[t].features[feature]) return t;
  }
  return "enterprise";
}
