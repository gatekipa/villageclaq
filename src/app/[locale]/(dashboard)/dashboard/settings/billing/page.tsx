"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Users,
  Calendar,
  Check,
  Crown,
  Sparkles,
  Zap,
} from "lucide-react";
import { useGroupSettings } from "@/lib/hooks/use-supabase-query";
import { ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";

interface PlanConfig {
  key: "free" | "starter" | "pro";
  icon: typeof Zap;
  priceKey: string;
  membersKey: string;
  features: string[];
}

const plans: PlanConfig[] = [
  {
    key: "free",
    icon: Users,
    priceKey: "freePriceLabel",
    membersKey: "freeMembers",
    features: ["freeFeature1", "freeFeature2", "freeFeature3"],
  },
  {
    key: "starter",
    icon: Zap,
    priceKey: "starterPriceLabel",
    membersKey: "starterMembers",
    features: ["starterFeature1", "starterFeature2", "starterFeature3", "starterFeature4"],
  },
  {
    key: "pro",
    icon: Crown,
    priceKey: "proPriceLabel",
    membersKey: "proMembers",
    features: ["proFeature1", "proFeature2", "proFeature3", "proFeature4", "proFeature5"],
  },
];

export default function BillingPage() {
  const t = useTranslations("billing");
  const { data: group, isLoading, isError, error, refetch } = useGroupSettings();

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  if (isError) {
    return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;
  }

  const groupData = group as Record<string, unknown> | null;
  const settings = (groupData?.settings || {}) as Record<string, unknown>;
  const currentPlan = (settings.plan as string) || "free";
  const memberCount = (settings.member_count as number) || 0;
  const memberLimit = currentPlan === "pro" ? 9999 : currentPlan === "starter" ? 50 : 15;
  const usagePercent = Math.min((memberCount / memberLimit) * 100, 100);
  const trialDays = (settings.trial_days_left as number) || 0;
  const renewalDate = (settings.renewal_date as string) || null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Trial Banner */}
      {trialDays > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
              {t("trialDaysLeft", { days: trialDays })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            {t("currentPlan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold capitalize">{t(currentPlan as "free" | "starter" | "pro")}</span>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                {t("currentPlanBadge")}
              </Badge>
            </div>
            <span className="text-lg font-semibold text-muted-foreground">
              {t(`${currentPlan}PriceLabel` as "freePriceLabel" | "starterPriceLabel" | "proPriceLabel")}
            </span>
          </div>

          {/* Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-4 w-4" />
                {t("usage")}
              </span>
              <span className="font-medium">
                {t("membersUsed", { used: memberCount, limit: currentPlan === "pro" ? "\u221e" : memberLimit })}
              </span>
            </div>
            {currentPlan !== "pro" && (
              <Progress value={usagePercent} className="h-2" />
            )}
          </div>

          {/* Renewal Date */}
          {renewalDate && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{t("renewalDate")}:</span>
              <span className="font-medium text-foreground">
                {new Date(renewalDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t("comparePlans")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(({ key, icon: Icon, priceKey, membersKey, features }) => {
            const isCurrent = currentPlan === key;
            const isUpgrade = plans.findIndex((p) => p.key === key) > plans.findIndex((p) => p.key === currentPlan);

            return (
              <Card
                key={key}
                className={
                  isCurrent
                    ? "border-emerald-500 dark:border-emerald-400 ring-1 ring-emerald-500/20"
                    : ""
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isCurrent
                          ? "bg-emerald-100 dark:bg-emerald-900/30"
                          : "bg-muted"
                      }`}>
                        <Icon className={`h-5 w-5 ${
                          isCurrent
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }`} />
                      </div>
                      <CardTitle className="text-base">{t(key)}</CardTitle>
                    </div>
                    {isCurrent && (
                      <Badge className="bg-emerald-600 text-white text-xs">
                        {t("currentPlanBadge")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {t(priceKey as "freePriceLabel" | "starterPriceLabel" | "proPriceLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(membersKey as "freeMembers" | "starterMembers" | "proMembers")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    {features.map((featureKey) => (
                      <li key={featureKey} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t(featureKey as never)}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      {t("currentPlanBadge")}
                    </Button>
                  ) : isUpgrade ? (
                    <Button className="w-full">{t("upgrade")}</Button>
                  ) : (
                    <Button variant="outline" className="w-full">
                      {t("downgrade")}
                    </Button>
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
