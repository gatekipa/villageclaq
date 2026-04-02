export type TierName = "free" | "pro" | "enterprise";

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
    allReports: boolean; // false = basic 5 reports only
    aiInsights: boolean;
    loans: boolean;
    committees: boolean;
    smsNotifications: boolean;
    boardPacket: boolean;
    subGroups: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
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
    maxMembers: 30,
    maxGroupsPerUser: 2,
    maxContributionTypes: 3,
    maxEventsPerMonth: 10,
    maxDocuments: 5,
    maxReliefPlans: 1,
    maxSavingsCycles: 1,
    maxWhatsappPerDay: 5,
    features: {
      pdfExport: true,
      csvExport: true,
      allReports: false,
      aiInsights: false,
      loans: false,
      committees: false,
      smsNotifications: false,
      boardPacket: false,
      subGroups: false,
      customBranding: false,
      prioritySupport: false,
    },
  },
  pro: {
    name: "Pro",
    nameKey: "tiers.pro",
    price: {
      usd: { monthly: 9, yearly: 89 },
      xaf: { monthly: 3000, yearly: 30000 },
    },
    maxMembers: 150,
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
    },
  },
  enterprise: {
    name: "Enterprise",
    nameKey: "tiers.enterprise",
    price: {
      usd: { monthly: 0, yearly: 0 }, // custom pricing
      xaf: { monthly: 0, yearly: 0 },
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
    },
  },
};

/** The 5 basic reports available on the Free tier */
export const FREE_REPORT_IDS = [
  "1", // Financial Summary
  "3", // Contribution Ledger
  "6", // Member Standing
  "8", // Who Hasn't Paid
  "11", // Attendance Summary
];

/** Check if a report ID is available on the given tier */
export function isReportAvailable(reportId: string, tier: TierName): boolean {
  if (tier === "free") return FREE_REPORT_IDS.includes(reportId);
  return true;
}

/** Feature display lists for pricing pages — sourced from TIERS config */
export function getTierFeatures(tier: TierName): string[] {
  const t = TIERS[tier];
  const features: string[] = [];

  if (tier === "free") {
    features.push(`tierFeatureMembers|${t.maxMembers}`);
    features.push(`tierFeatureContribTypes|${t.maxContributionTypes}`);
    features.push("tierFeatureBasicReports");
    features.push("tierFeatureWhatsappEmail");
    features.push(`tierFeatureEvents|${t.maxEventsPerMonth}`);
    features.push(`tierFeatureGroups|${t.maxGroupsPerUser}`);
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
