"use client";

import { useTranslations } from "next-intl";
import {
  DollarSign,
  TrendingDown,
  Heart,
  AlertTriangle,
  Crown,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const mrrTrendData = [
  { month: "Oct 2025", value: 1800 },
  { month: "Nov 2025", value: 1950 },
  { month: "Dec 2025", value: 2100 },
  { month: "Jan 2026", value: 2200 },
  { month: "Feb 2026", value: 2350 },
  { month: "Mar 2026", value: 2450 },
];

const revenueByPlan = [
  { plan: "planFree", amount: 0, percent: 0 },
  { plan: "planStarter", amount: 980, percent: 40 },
  { plan: "planPro", amount: 1250, percent: 51 },
  { plan: "planEnterprise", amount: 220, percent: 9 },
];

const topGroups = [
  { name: "Bamenda Alumni Union", plan: "Pro", amount: 89 },
  { name: "Douala Business Network", plan: "Enterprise", amount: 85 },
  { name: "Kumba Development Assoc.", plan: "Pro", amount: 79 },
  { name: "Buea Tech Community", plan: "Pro", amount: 75 },
  { name: "Limbe Fishermen Njangi", plan: "Starter", amount: 69 },
  { name: "Yaoundé Church Group", plan: "Starter", amount: 59 },
  { name: "Bafoussam Savings Club", plan: "Pro", amount: 55 },
  { name: "Kribi Tourism Assoc.", plan: "Starter", amount: 49 },
  { name: "Maroua Women United", plan: "Starter", amount: 45 },
  { name: "Garoua Youth League", plan: "Starter", amount: 39 },
];

const upcomingRenewals = [
  { group: "Bamenda Alumni Union", plan: "Pro", date: "2026-04-01", amount: 89 },
  { group: "Douala Business Network", plan: "Enterprise", date: "2026-04-03", amount: 85 },
  { group: "Kumba Development Assoc.", plan: "Pro", date: "2026-04-05", amount: 79 },
  { group: "Buea Tech Community", plan: "Pro", date: "2026-04-08", amount: 75 },
  { group: "Limbe Fishermen Njangi", plan: "Starter", date: "2026-04-10", amount: 69 },
];

const planColors: Record<string, string> = {
  Free: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Pro: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function RevenuePage() {
  const t = useTranslations("admin");
  const maxMrr = Math.max(...mrrTrendData.map((d) => d.value));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("revenue")}</h1>
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
              <p className="text-lg font-bold">$2,450</p>
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
              <p className="text-lg font-bold">2.1%</p>
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
              <p className="text-lg font-bold">$340</p>
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
              <p className="text-lg font-bold">1.8%</p>
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
                  <Badge className={planColors[group.plan]}>
                    {group.plan}
                  </Badge>
                  <span className="text-sm font-semibold">
                    ${group.amount}/{t("perMonth").replace("/", "")}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
                  <Badge className={planColors[item.plan]}>
                    {item.plan}
                  </Badge>
                  <span className="text-sm font-semibold">${item.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
