"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Users,
  FileText,
  FolderLock,
  Check,
  Crown,
  Sparkles,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { TIERS, type TierName } from "@/lib/subscription-tiers";

export default function BillingPage() {
  const t = useTranslations("tiers");
  const locale = useLocale();
  const {
    tier,
    limits,
    isFreeTier,
    isProTier,
    isEnterprise,
    counts,
    useXafPricing,
    pricingUrl,
  } = useSubscription();

  const tierIcons: Record<TierName, typeof Zap> = {
    free: Zap,
    pro: Crown,
    enterprise: Sparkles,
  };
  const TierIcon = tierIcons[tier];

  // Usage items for the progress bars
  const usageItems = [
    {
      label: t("resource_members"),
      icon: Users,
      current: counts.members,
      max: limits.maxMembers,
    },
    {
      label: t("resource_contributionTypes"),
      icon: CreditCard,
      current: counts.contributionTypes,
      max: limits.maxContributionTypes,
    },
    {
      label: t("resource_documents"),
      icon: FolderLock,
      current: counts.documents,
      max: limits.maxDocuments,
    },
  ];

  // Pricing display
  const proPrice = useXafPricing
    ? `${TIERS.pro.price.xaf.monthly.toLocaleString()} FCFA/${t("month")}`
    : `$${TIERS.pro.price.usd.monthly}/${t("month")}`;
  const proYearly = useXafPricing
    ? `${TIERS.pro.price.xaf.yearly.toLocaleString()} FCFA/${t("year")}`
    : `$${TIERS.pro.price.usd.yearly}/${t("year")}`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("currentPlan")}</h1>
        <p className="text-muted-foreground">{t("usageDashboard")}</p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TierIcon className="h-4 w-4" />
            {t("currentPlan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{t(tier)}</span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
              {t("currentPlan")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Usage Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usageDashboard")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {usageItems.map((item) => {
            const isUnlimited = item.max === -1;
            const pct = isUnlimited ? 0 : Math.min((item.current / item.max) * 100, 100);
            const ItemIcon = item.icon;
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ItemIcon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <span className="font-medium">
                    {isUnlimited
                      ? `${item.current} (${t("unlimitedLabel")})`
                      : `${item.current} / ${item.max}`}
                  </span>
                </div>
                {!isUnlimited && <Progress value={pct} className="h-2" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Upgrade CTA (Free tier only) */}
      {isFreeTier && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t("proCtaTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("proCtaDesc")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{proPrice}</span>
              <span>•</span>
              <span>{proYearly}</span>
            </div>
            <Link href={pricingUrl}>
              <Button className="gap-2">
                {t("upgradeToPro")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t("learnMore")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["free", "pro", "enterprise"] as const).map((tierKey) => {
            const tierConfig = TIERS[tierKey];
            const isCurrent = tier === tierKey;
            const Icon = tierIcons[tierKey];
            const features = tierKey === "free"
              ? [t("tierFeatureMembers", { "0": tierConfig.maxMembers }), t("tierFeatureContribTypes", { "0": tierConfig.maxContributionTypes }), t("tierFeatureBasicReports")]
              : tierKey === "pro"
              ? [t("tierFeatureMembers", { "0": tierConfig.maxMembers }), t("tierFeatureUnlimitedContribTypes"), t("tierFeatureAllReportsAI"), t("tierFeaturePrioritySupport")]
              : [t("tierFeatureUnlimitedMembers"), t("tierFeatureEverythingPro"), t("tierFeatureSubGroups"), t("tierFeatureDedicatedSupport")];

            return (
              <Card
                key={tierKey}
                className={isCurrent ? "border-emerald-500 dark:border-emerald-400 ring-1 ring-emerald-500/20" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isCurrent ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"}`}>
                        <Icon className={`h-5 w-5 ${isCurrent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                      </div>
                      <CardTitle className="text-base">{t(tierKey)}</CardTitle>
                    </div>
                    {isCurrent && (
                      <Badge className="bg-emerald-600 text-white text-xs">{t("currentPlan")}</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {tierKey === "free" ? `$0/${t("month")}` : tierKey === "pro" ? `$${tierConfig.price.usd.monthly}/${t("month")}` : t("customPricing")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    {features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>{t("currentPlan")}</Button>
                  ) : tierKey === "enterprise" ? (
                    <Link href="/contact"><Button variant="outline" className="w-full">{t("contactUs")}</Button></Link>
                  ) : (
                    <Link href={pricingUrl}><Button className="w-full">{t("upgrade")}</Button></Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
