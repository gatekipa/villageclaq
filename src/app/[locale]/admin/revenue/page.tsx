"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import {
  DollarSign,
  TrendingDown,
  Heart,
  AlertTriangle,
  Crown,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { formatAmount } from "@/lib/currencies";

interface MrrTrendItem {
  month: string;
  value: number;
}

interface TopGroup {
  name: string;
  plan: string;
  amount: number;
}

interface UpcomingRenewal {
  group: string;
  plan: string;
  date: string;
  amount: number;
}

const planColors: Record<string, string> = {
  Free: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Pro: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function RevenuePage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  const { results, loading, error: fetchError } = useAdminQuery([
    { key: "payments", table: "payments", select: "amount, created_at, group_id" },
    { key: "groups", table: "groups", select: "id, name, subscription_plan" },
    {
      key: "renewalGroups",
      table: "groups",
      select: "name, subscription_plan, subscription_renewal_date",
      filters: [{ column: "subscription_renewal_date", op: "gt", value: nowIso }],
      order: { column: "subscription_renewal_date", ascending: true },
      limit: 5,
    },
  ]);

  const {
    mrr, churnRate, ltv, failureRate, mrrTrendData, revenueByPlan, topGroups, upcomingRenewals,
  } = useMemo(() => {
    const allPayments = (results.payments?.data ?? []) as Array<Record<string, unknown>>;
    const groups = (results.groups?.data ?? []) as Array<Record<string, unknown>>;
    const renewalGroupsData = (results.renewalGroups?.data ?? []) as Array<Record<string, unknown>>;

    const successfulPayments = allPayments;

    // Total revenue
    const totalRevenue = successfulPayments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    // MRR: sum of payments in the current month
    const now = new Date();
    const currentMonthPayments = successfulPayments.filter((p) => {
      const d = new Date(p.created_at as string);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const currentMrr = currentMonthPayments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    // Payment failure rate (no failed-payment tracking yet)
    const currentFailureRate = 0;

    // MRR Trend: group successful payments by month (last 6 months)
    const monthMap = new Map<string, number>();
    const monthLabels = new Map<string, string>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
      monthMap.set(key, 0);
      monthLabels.set(key, label);
    }

    successfulPayments.forEach((p) => {
      const d = new Date(p.created_at as string);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap.has(key)) {
        monthMap.set(key, (monthMap.get(key) || 0) + (Number(p.amount) || 0));
      }
    });

    const trendData: MrrTrendItem[] = [];
    monthLabels.forEach((label, key) => {
      trendData.push({ month: label, value: monthMap.get(key) || 0 });
    });

    // Churn rate
    const groupsLastMonth = new Set<string>();
    const groupsThisMonth = new Set<string>();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    successfulPayments.forEach((p) => {
      const d = new Date(p.created_at as string);
      if (d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()) {
        groupsLastMonth.add(p.group_id as string);
      }
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        groupsThisMonth.add(p.group_id as string);
      }
    });
    let churned = 0;
    groupsLastMonth.forEach((gid) => {
      if (!groupsThisMonth.has(gid)) churned++;
    });
    const churn = groupsLastMonth.size > 0
      ? Math.round((churned / groupsLastMonth.size) * 1000) / 10
      : 0;

    // LTV
    const uniqueGroups = new Set(successfulPayments.map((p) => p.group_id as string));
    const currentLtv = uniqueGroups.size > 0 ? Math.round(totalRevenue / uniqueGroups.size) : 0;

    // Build group map
    const groupMap = new Map<string, { name: string; plan: string }>();
    groups.forEach((g) => {
      groupMap.set(g.id as string, {
        name: (g.name as string) || "Unknown",
        plan: (g.subscription_plan as string) || "Free",
      });
    });

    // Revenue by plan
    const planTotals = new Map<string, number>();
    successfulPayments.forEach((p) => {
      const info = groupMap.get(p.group_id as string);
      const plan = info?.plan || "Free";
      planTotals.set(plan, (planTotals.get(plan) || 0) + (Number(p.amount) || 0));
    });
    const planTotal = Array.from(planTotals.values()).reduce((sum, amt) => sum + amt, 0);
    const planData = ["Free", "Starter", "Pro", "Enterprise"].map((plan) => {
      const amount = planTotals.get(plan) || 0;
      return {
        plan: `plan${plan}`,
        amount,
        percent: planTotal > 0 ? Math.round((amount / planTotal) * 100) : 0,
      };
    });

    // Top 10 groups
    const groupTotals = new Map<string, number>();
    successfulPayments.forEach((p) => {
      const gid = p.group_id as string;
      groupTotals.set(gid, (groupTotals.get(gid) || 0) + (Number(p.amount) || 0));
    });
    const topGroupsList = Array.from(groupTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([gid, amount]) => {
        const info = groupMap.get(gid);
        return {
          name: info?.name || "Unknown Group",
          plan: info?.plan || "Free",
          amount: Math.round(amount),
        };
      });

    // Upcoming renewals
    const renewals: UpcomingRenewal[] = renewalGroupsData.map((g) => ({
      group: (g.name as string) || "Unknown",
      plan: (g.subscription_plan as string) || "Free",
      date: g.subscription_renewal_date
        ? new Date(g.subscription_renewal_date as string).toISOString().split("T")[0]
        : "",
      amount: 0,
    }));

    return {
      mrr: currentMrr, churnRate: churn, ltv: currentLtv, failureRate: currentFailureRate,
      mrrTrendData: trendData, revenueByPlan: planData, topGroups: topGroupsList,
      upcomingRenewals: renewals,
    };
  }, [results, dateLocale]);

  const maxMrr = Math.max(...mrrTrendData.map((d) => d.value), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("revenue")}</h1>
        <p className="text-sm text-muted-foreground">{t("revenueSubtitle")}</p>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("mrr")}</p>
              <p className="text-lg font-bold">{formatAmount(mrr, "USD")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("churnRate")}</p>
              <p className="text-lg font-bold">{churnRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Heart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("ltv")}</p>
              <p className="text-lg font-bold">{formatAmount(ltv, "USD")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("paymentFailureRate")}</p>
              <p className="text-lg font-bold">{failureRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MRR Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mrrTrend")}</CardTitle>
        </CardHeader>
        <CardContent>
          {mrrTrendData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("noDataYet")}
            </p>
          ) : (
            <div className="space-y-3">
              {mrrTrendData.map((item) => (
                <div key={item.month} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {item.month}
                  </span>
                  <div className="flex-1">
                    <div
                      className="h-6 rounded bg-emerald-500 dark:bg-emerald-600 transition-all"
                      style={{ width: `${(item.value / maxMrr) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-medium">
                    {formatAmount(item.value, "USD")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue by Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("revenueByPlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {revenueByPlan.map((item) => (
              <div key={item.plan} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t(item.plan)}</span>
                  <span className="text-muted-foreground">
                    {formatAmount(item.amount, "USD")}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500 dark:bg-emerald-600 transition-all"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-5 w-5" />
            {t("topGroups")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("noDataYet")}
            </p>
          ) : (
            <div className="space-y-3">
              {topGroups.map((group, idx) => (
                <div
                  key={group.name}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-3 pl-9 sm:pl-0">
                    <Badge className={planColors[group.plan] || planColors.Free}>
                      {group.plan}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {formatAmount(group.amount, "USD")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Renewals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            {t("upcomingRenewals")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("noDataYet")}
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingRenewals.map((item) => (
                <div
                  key={item.group}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.group}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("renewalDate")}: {item.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={planColors[item.plan] || planColors.Free}>
                      {item.plan}
                    </Badge>
                    {item.amount > 0 && (
                      <span className="text-sm font-semibold">{formatAmount(item.amount, "USD")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
