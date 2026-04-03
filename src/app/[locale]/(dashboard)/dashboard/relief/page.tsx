"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, DollarSign, Clock, Shield, Plus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { useReliefPlans } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { FeatureLock } from "@/components/ui/upgrade-prompt";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { formatAmount } from "@/lib/currencies";


export default function ReliefPage() {
  const t = useTranslations("relief");
  const tt = useTranslations("tiers");
  const { currentGroup } = useGroup();
  const { canUseFeature } = useSubscription();
  const { data: plans, isLoading, isError, error, refetch } = useReliefPlans();

  if (!canUseFeature("reliefPlans")) {
    return (
      <FeatureLock
        feature="reliefPlans"
        featureName={t("title")}
        description={tt("reliefLockedDesc")}
        variant="page"
      />
    );
  }

  if (isLoading) return <CardGridSkeleton cards={3} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const activePlans = (plans || []).filter((p: Record<string, unknown>) => p.is_active);

  if (activePlans.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <EmptyState
          icon={Heart}
          title={t("noPlans")}
          description={t("noPlansDesc")}
          action={
            <Link href="/dashboard/relief/plans">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("createPlan")}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const currency = currentGroup?.currency || "XAF";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("activePlans")}</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activePlans.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activePlans.map((plan: Record<string, unknown>) => {
          const id = plan.id as string;
          const name = (plan.name as string) || "";
          const description = (plan.description as string) || "";
          const qualifyingEvents = (plan.qualifying_events as string[]) || [];
          const contributionAmount = Number(plan.contribution_amount) || 0;
          const contributionFrequency = (plan.contribution_frequency as string) || "monthly";
          const payoutRules = (plan.payout_rules as Record<string, unknown>) || {};
          const waitingPeriodDays = (plan.waiting_period_days as number) || 0;
          const autoEnroll = plan.auto_enroll as boolean;

          return (
            <Card
              key={id}
              className="transition-all hover:shadow-md hover:border-primary/30"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{name}</CardTitle>
                  <Badge
                    variant="default"
                    className="shrink-0 bg-emerald-600 text-white dark:bg-emerald-500"
                  >
                    {t("activePlans")}
                  </Badge>
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Qualifying Events */}
                {qualifyingEvents.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      {t("qualifyingEvents")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {qualifyingEvents.map((event: string) => (
                        <Badge
                          key={event}
                          variant="secondary"
                          className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {t(`eventTypes.${event}` as Parameters<typeof t>[0])}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contribution */}
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{formatAmount(contributionAmount, currency)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t(`frequency${({ monthly: "Monthly", quarterly: "Quarterly", per_event: "PerEvent", annual: "Annual" } as Record<string, string>)[contributionFrequency] || "Monthly"}`)}</p>
                  </div>
                </div>

                {/* Payout Rules */}
                {Object.keys(payoutRules).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {t("payoutPerEvent")}
                    </p>
                    <div className="space-y-1">
                      {Object.entries(payoutRules).map(([eventType, amount]) => (
                        <div key={eventType} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {t(`eventTypes.${eventType}` as Parameters<typeof t>[0])}
                          </span>
                          <span className="font-medium">{formatAmount(Number(amount), currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waiting period & auto-enroll */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-xs text-muted-foreground">
                  {waitingPeriodDays > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {waitingPeriodDays} {t("waitingPeriod")}
                    </span>
                  )}
                  {autoEnroll && (
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {t("autoEnroll")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
