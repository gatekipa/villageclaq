"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/currencies";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditCard, Info, ExternalLink, AlertCircle, Ticket, FileText } from "lucide-react";
import { Link } from "@/i18n/routing";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";

interface Plan {
  id: string;
  name: string;
  name_fr: string | null;
  slug: string | null;
  price: number;
  billing_period: "monthly" | "annual";
  features: string[];
  member_limit: number | null;
  group_limit: number;
  is_active: boolean;
  sort_order: number;
}

export default function SubscriptionPlansPage() {
  const t = useTranslations("admin");
  const { results, loading, error } = useAdminQuery([
    {
      key: "plans",
      table: "subscription_plans",
      select: "*",
      order: { column: "sort_order", ascending: true },
    },
    {
      key: "subscriptions",
      table: "group_subscriptions",
      select: "tier, status",
      filters: [{ column: "status", op: "eq", value: "active" }],
    },
  ]);

  const plans = useMemo<Plan[]>(
    () => (results.plans?.data ?? []) as Plan[],
    [results]
  );

  // Count subscribers per tier (plan slug / name match)
  const subscriberCounts = useMemo(() => {
    const subs = (results.subscriptions?.data ?? []) as Array<{ tier: string; status: string }>;
    const counts: Record<string, number> = {};
    for (const s of subs) {
      counts[s.tier] = (counts[s.tier] || 0) + 1;
    }
    return counts;
  }, [results]);

  const totalPlans = plans.length;
  const activePlans = plans.filter((p) => p.is_active).length;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("subscriptionPlans")}</h1>
        <p className="text-muted-foreground">{t("plansSubtitle")}</p>
      </div>

      {/* Info banner */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("subscriptionNotConfigured")}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t("subscriptionNotConfiguredDesc")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("totalPlans")}</p>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold">{totalPlans}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("activePlans")}</p>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold">{activePlans}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="plans">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="plans" className="flex-1 sm:flex-initial gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            {t("plansTab")}
          </TabsTrigger>
          <TabsTrigger value="offline" className="flex-1 sm:flex-initial gap-1.5">
            <Ticket className="h-3.5 w-3.5" />
            {t("offlineCodesTab")}
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex-1 sm:flex-initial gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {t("customRequestsTab")}
          </TabsTrigger>
        </TabsList>

        {/* Subscription Plans Tab */}
        <TabsContent value="plans" className="mt-4">
          {loading ? (
            <Skeleton className="h-64" />
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t("noPlans")}</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("planName")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">{t("planPrice")}</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("maxMembers")}</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("subscribers")}</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{plan.name}</p>
                        {plan.name_fr && <p className="text-xs text-muted-foreground">{plan.name_fr}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {plan.price === 0 ? (
                          <span className="text-emerald-600">{t("free") || "Free"}</span>
                        ) : (
                          <span>
                            {formatAmount(plan.price, "USD")}
                            <span className="text-xs text-muted-foreground ml-1">
                              / {plan.billing_period === "annual" ? t("perYear") : t("perMonth")}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {plan.member_limit ? plan.member_limit : "∞"}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {subscriberCounts[plan.slug ?? plan.name.toLowerCase()] ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={plan.is_active ? "default" : "secondary"}>
                          {plan.is_active ? t("statusActive") : t("statusArchived")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Offline Codes Tab */}
        <TabsContent value="offline" className="mt-4">
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Ticket className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm mb-4">{t("manageOfflineCodes")}</p>
            <Link href="/admin/vouchers">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("vouchers")}
              </Button>
            </Link>
          </div>
        </TabsContent>

        {/* Custom Requests Tab */}
        <TabsContent value="custom" className="mt-4">
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">{t("noCustomRequests")}</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
