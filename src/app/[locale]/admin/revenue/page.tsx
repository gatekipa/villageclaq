"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { createClient } from "@/lib/supabase/client";

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
  const [loading, setLoading] = useState(true);
  const [mrr, setMrr] = useState(0);
  const [churnRate, setChurnRate] = useState(0);
  const [ltv, setLtv] = useState(0);
  const [failureRate, setFailureRate] = useState(0);
  const [mrrTrendData, setMrrTrendData] = useState<MrrTrendItem[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<
    { plan: string; amount: number; percent: number }[]
  >([]);
  const [topGroups, setTopGroups] = useState<TopGroup[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<UpcomingRenewal[]>([]);

  const fetchRevenueData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);

    try {
      // Fetch all payments (payments table has no status column — all recorded payments are valid)
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at, group_id");

      const allPayments = payments || [];
      const successfulPayments = allPayments; // All recorded payments are valid
      const failedPayments: typeof allPayments = []; // No failed-payment tracking yet

      // Total revenue
      const totalRevenue = successfulPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
      );

      // MRR: sum of payments in the current month
      const now = new Date();
      const currentMonthPayments = successfulPayments.filter((p) => {
        const d = new Date(p.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const currentMrr = currentMonthPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
      );
      setMrr(currentMrr);

      // Payment failure rate
      const totalCount = allPayments.length;
      const failedCount = failedPayments.length;
      setFailureRate(totalCount > 0 ? Math.round((failedCount / totalCount) * 1000) / 10 : 0);

      // MRR Trend: group successful payments by month (last 6 months)
      const monthMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        monthMap.set(key, 0);
        // store label mapping
        monthMap.set(`label_${key}`, 0);
      }

      const monthLabels = new Map<string, string>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        monthMap.set(key, 0);
        monthLabels.set(key, label);
      }

      successfulPayments.forEach((p) => {
        const d = new Date(p.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap.has(key)) {
          monthMap.set(key, (monthMap.get(key) || 0) + (Number(p.amount) || 0));
        }
      });

      const trendData: MrrTrendItem[] = [];
      monthLabels.forEach((label, key) => {
        trendData.push({ month: label, value: monthMap.get(key) || 0 });
      });
      setMrrTrendData(trendData);

      // Churn rate: simple estimate — groups that paid 2+ months ago but not this month
      const groupsLastMonth = new Set<string>();
      const groupsThisMonth = new Set<string>();
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      successfulPayments.forEach((p) => {
        const d = new Date(p.created_at);
        if (d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()) {
          groupsLastMonth.add(p.group_id);
        }
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          groupsThisMonth.add(p.group_id);
        }
      });
      let churned = 0;
      groupsLastMonth.forEach((gid) => {
        if (!groupsThisMonth.has(gid)) churned++;
      });
      const churn = groupsLastMonth.size > 0
        ? Math.round((churned / groupsLastMonth.size) * 1000) / 10
        : 0;
      setChurnRate(churn);

      // LTV: totalRevenue / unique groups that ever paid
      const uniqueGroups = new Set(successfulPayments.map((p) => p.group_id));
      setLtv(uniqueGroups.size > 0 ? Math.round(totalRevenue / uniqueGroups.size) : 0);

      // Fetch groups for top-paying and plan info
      const { data: groups } = await supabase
        .from("groups")
        .select("id, name, subscription_plan");

      const groupMap = new Map<string, { name: string; plan: string }>();
      (groups || []).forEach((g) => {
        groupMap.set(g.id, {
          name: g.name || "Unknown",
          plan: g.subscription_plan || "Free",
        });
      });

      // Revenue by plan
      const planTotals = new Map<string, number>();
      successfulPayments.forEach((p) => {
        const info = groupMap.get(p.group_id);
        const plan = info?.plan || "Free";
        planTotals.set(plan, (planTotals.get(plan) || 0) + (Number(p.amount) || 0));
      });
      const planEntries = Array.from(planTotals.entries()).sort((a, b) => b[1] - a[1]);
      const planTotal = planEntries.reduce((sum, [, amt]) => sum + amt, 0);
      const planData = ["Free", "Starter", "Pro", "Enterprise"].map((plan) => {
        const amount = planTotals.get(plan) || 0;
        return {
          plan: `plan${plan}`,
          amount,
          percent: planTotal > 0 ? Math.round((amount / planTotal) * 100) : 0,
        };
      });
      setRevenueByPlan(planData);

      // Top 10 groups by total payment
      const groupTotals = new Map<string, number>();
      successfulPayments.forEach((p) => {
        groupTotals.set(
          p.group_id,
          (groupTotals.get(p.group_id) || 0) + (Number(p.amount) || 0)
        );
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
      setTopGroups(topGroupsList);

      // Upcoming renewals: groups with subscription_renewal_date in the future
      const { data: renewalGroups } = await supabase
        .from("groups")
        .select("name, subscription_plan, subscription_renewal_date")
        .gt("subscription_renewal_date", now.toISOString())
        .order("subscription_renewal_date", { ascending: true })
        .limit(5);

      const renewals: UpcomingRenewal[] = (renewalGroups || []).map((g) => ({
        group: g.name || "Unknown",
        plan: g.subscription_plan || "Free",
        date: g.subscription_renewal_date
          ? new Date(g.subscription_renewal_date).toISOString().split("T")[0]
          : "",
        amount: 0,
      }));
      setUpcomingRenewals(renewals);
    } catch (err) {
      console.error("Error fetching revenue data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRevenueData();
  }, [fetchRevenueData]);

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

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("mrr")}</p>
              <p className="text-lg font-bold">${mrr.toLocaleString()}</p>
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
              <p className="text-lg font-bold">${ltv.toLocaleString()}</p>
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
                    ${item.value.toLocaleString()}
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
                    ${item.amount.toLocaleString()}
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
                      ${group.amount.toLocaleString()}
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
                      <span className="text-sm font-semibold">${item.amount}</span>
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
