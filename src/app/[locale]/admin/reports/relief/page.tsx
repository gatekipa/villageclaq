"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, DollarSign, Users, Calculator, AlertCircle, Info,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface MonthPoint {
  month: string;
  amount: number;
}

interface PlanSlice {
  name: string;
  value: number;
}

interface ClaimRow {
  planName: string;
  groupName: string;
  amount: string;
  status: string;
  eventType: string;
  date: string;
}

interface GroupFund {
  groupName: string;
  planName: string;
  contributionAmount: number;
  currency: string;
  enrollments: number;
  claims: number;
  disbursed: number;
  isActive: boolean;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  reviewing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  denied: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function getCutoffDate(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "1m": return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "3m": return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case "6m": return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    case "1y": return new Date(now.getFullYear() - 1, now.getMonth(), 1);
  }
}

function getTimeRangeLabel(range: TimeRange, t: (key: string) => string): string {
  switch (range) {
    case "1m": return t("oneMonth");
    case "3m": return t("threeMonths");
    case "6m": return t("sixMonths");
    case "1y": return t("oneYear");
  }
}

export default function ReliefReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const cutoff = useMemo(() => getCutoffDate(timeRange).toISOString(), [timeRange]);

  const { results, loading, error } = useAdminQuery([
    {
      key: "plans",
      table: "relief_plans",
      select: "id, name, is_active, group_id, contribution_amount, groups:group_id(name, currency)",
    },
    {
      key: "claims",
      table: "relief_claims",
      select: "id, plan_id, membership_id, status, amount, event_type, created_at",
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
      order: { column: "created_at", ascending: false },
    },
    {
      key: "allClaims",
      table: "relief_claims",
      select: "id, plan_id, amount, status",
    },
    {
      key: "payouts",
      table: "relief_payouts",
      select: "amount, created_at, claim_id",
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
    },
    {
      key: "allPayouts",
      table: "relief_payouts",
      select: "amount, claim_id",
    },
    {
      key: "enrollments",
      table: "relief_enrollments",
      select: "id, plan_id, is_active",
    },
  ]);

  // Detect per-query errors
  const queryErrors = useMemo(() => {
    const errs: string[] = [];
    for (const key of ["plans", "claims", "allClaims", "payouts", "allPayouts", "enrollments"]) {
      const qErr = results[key]?.error;
      if (qErr) errs.push(`${key}: ${qErr}`);
    }
    return errs;
  }, [results]);

  const {
    isEmpty, activePlans, totalDisbursed, enrolledCount, avgClaim,
    disbursementChart, planChart, recentClaims, groupFunds,
  } = useMemo(() => {
    const plans = (results.plans?.data ?? []) as Array<Record<string, unknown>>;
    const claims = (results.claims?.data ?? []) as Array<Record<string, unknown>>;
    const allClaims = (results.allClaims?.data ?? []) as Array<Record<string, unknown>>;
    const payouts = (results.payouts?.data ?? []) as Array<Record<string, unknown>>;
    const allPayouts = (results.allPayouts?.data ?? []) as Array<Record<string, unknown>>;
    const enrollments = (results.enrollments?.data ?? []) as Array<Record<string, unknown>>;

    if (plans.length === 0) {
      return {
        isEmpty: true, activePlans: 0, totalDisbursed: 0, enrolledCount: 0,
        avgClaim: 0, disbursementChart: [] as MonthPoint[], planChart: [] as PlanSlice[],
        recentClaims: [] as ClaimRow[], groupFunds: [] as GroupFund[],
      };
    }

    const activeCount = plans.filter((p) => p.is_active).length;
    const disbursed = payouts.reduce((s, p) => s + Number(p.amount), 0);
    const activeEnrollments = enrollments.filter((e) => e.is_active).length;
    const avg = claims.length > 0 ? claims.reduce((s, c) => s + Number(c.amount), 0) / claims.length : 0;

    // Monthly disbursement chart (payouts in time range)
    const cutoffDate = getCutoffDate(timeRange);
    const now = new Date();
    const monthMap = new Map<string, number>();
    const d = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    while (d <= now) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, 0);
      d.setMonth(d.getMonth() + 1);
    }

    for (const p of payouts) {
      const dt = new Date(p.created_at as string);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + Number(p.amount));
    }

    const dChart: MonthPoint[] = [];
    for (const [key, val] of monthMap) {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
      dChart.push({ month: label, amount: val });
    }

    // Relief claims by plan name (time-range filtered)
    const planNameMap = new Map<string, string>();
    for (const p of plans) planNameMap.set(p.id as string, p.name as string);

    const planAmountMap = new Map<string, number>();
    for (const c of claims) {
      const pName = planNameMap.get(c.plan_id as string) || "Unknown";
      planAmountMap.set(pName, (planAmountMap.get(pName) || 0) + Number(c.amount));
    }
    const pChart: PlanSlice[] = [];
    for (const [name, value] of planAmountMap) {
      pChart.push({ name, value });
    }

    // Build group funds table (all-time data)
    const planGroupMap = new Map<string, { groupName: string; planName: string; contributionAmount: number; currency: string; isActive: boolean }>();
    for (const p of plans) {
      const grp = p.groups as { name: string; currency: string } | null;
      planGroupMap.set(p.id as string, {
        groupName: grp?.name ?? "\u2014",
        planName: p.name as string,
        contributionAmount: Number(p.contribution_amount ?? 0),
        currency: grp?.currency ?? "XAF",
        isActive: p.is_active as boolean,
      });
    }

    // Count enrollments per plan
    const enrollPerPlan = new Map<string, number>();
    for (const e of enrollments) {
      if (e.is_active) {
        const pid = e.plan_id as string;
        enrollPerPlan.set(pid, (enrollPerPlan.get(pid) || 0) + 1);
      }
    }

    // Count claims per plan (all time)
    const claimsPerPlan = new Map<string, number>();
    for (const c of allClaims) {
      const pid = c.plan_id as string;
      claimsPerPlan.set(pid, (claimsPerPlan.get(pid) || 0) + 1);
    }

    // Sum payouts per plan (all time, need to map claim_id → plan_id)
    const claimToPlan = new Map<string, string>();
    for (const c of allClaims) {
      claimToPlan.set(c.id as string, c.plan_id as string);
    }
    const disbursedPerPlan = new Map<string, number>();
    for (const p of allPayouts) {
      const planId = claimToPlan.get(p.claim_id as string);
      if (planId) {
        disbursedPerPlan.set(planId, (disbursedPerPlan.get(planId) || 0) + Number(p.amount));
      }
    }

    const gFunds: GroupFund[] = [];
    for (const [planId, info] of planGroupMap) {
      gFunds.push({
        ...info,
        enrollments: enrollPerPlan.get(planId) || 0,
        claims: claimsPerPlan.get(planId) || 0,
        disbursed: disbursedPerPlan.get(planId) || 0,
      });
    }
    gFunds.sort((a, b) => a.groupName.localeCompare(b.groupName));

    // Recent 10 claims
    const recent: ClaimRow[] = claims.slice(0, 10).map((c) => {
      const planInfo = planGroupMap.get(c.plan_id as string);
      return {
        planName: planInfo?.planName || "\u2014",
        groupName: planInfo?.groupName || "\u2014",
        amount: formatAmount(Number(c.amount), planInfo?.currency || "XAF"),
        status: c.status as string,
        eventType: (c.event_type as string || "").replace(/_/g, " "),
        date: new Date(c.created_at as string).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }),
      };
    });

    return {
      isEmpty: false, activePlans: activeCount, totalDisbursed: disbursed,
      enrolledCount: activeEnrollments, avgClaim: avg,
      disbursementChart: dChart, planChart: pChart, recentClaims: recent,
      groupFunds: gFunds,
    };
  }, [results, timeRange, dateLocale]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <AlertCircle className="h-16 w-16 mb-4 text-red-500" />
        <p>{error}</p>
      </div>
    );
  }

  if (!loading && isEmpty) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("reliefPlanReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("reliefReportsDesc")}</p>
        </div>

        {/* Show per-query errors if any */}
        {queryErrors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{t("queryErrors")}</p>
            <ul className="mt-1 list-disc list-inside text-xs text-red-600 dark:text-red-300">
              {queryErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-col items-center justify-center min-h-[40vh] text-muted-foreground">
          <Shield className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">{t("noReliefData")}</p>
          <p className="text-sm mt-1">{t("noReliefDataDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("reliefPlanReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("reliefReportsDesc")}</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/50">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                timeRange === r
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {getTimeRangeLabel(r, t)}
            </button>
          ))}
        </div>
      </div>

      {/* Per-query errors */}
      {queryErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{t("queryErrors")}</p>
          <ul className="mt-1 list-disc list-inside text-xs text-red-600 dark:text-red-300">
            {queryErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("activePlans")}</p>
                    <p className="text-2xl font-bold">{activePlans}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("totalDisbursed")}</p>
                    <p className="text-2xl font-bold">{formatAmount(totalDisbursed, "XAF")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("enrolledBeneficiaries")}</p>
                    <p className="text-2xl font-bold">{enrolledCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("avgClaim")}</p>
                    <p className="text-2xl font-bold">{formatAmount(avgClaim, "XAF")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Funds by Group Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("fundsByGroup")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : groupFunds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("noDataYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("groupLabel")}</th>
                    <th className="pb-3 font-medium">{t("planName")}</th>
                    <th className="pb-3 font-medium text-right">{t("contribution")}</th>
                    <th className="pb-3 font-medium text-right">{t("enrolledLabel")}</th>
                    <th className="pb-3 font-medium text-right">{t("claimsLabel")}</th>
                    <th className="pb-3 font-medium text-right">{t("totalDisbursed")}</th>
                    <th className="pb-3 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupFunds.map((fund, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 font-medium">{fund.groupName}</td>
                      <td className="py-3">{fund.planName}</td>
                      <td className="py-3 text-right">{formatAmount(fund.contributionAmount, fund.currency)}</td>
                      <td className="py-3 text-right">{fund.enrollments}</td>
                      <td className="py-3 text-right">{fund.claims}</td>
                      <td className="py-3 text-right">{formatAmount(fund.disbursed, fund.currency)}</td>
                      <td className="py-3">
                        <Badge className={fund.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }>
                          {fund.isActive ? t("statusActive") : t("disabled")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disbursement Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("disbursementTrend")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : disbursementChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={disbursementChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [formatAmount(Number(value), "XAF"), t("totalDisbursed")]}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Relief by Plan PieChart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reliefByType")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : planChart.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t("noClaimsInRange")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={planChart}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${formatAmount(value, "XAF")}`}
                >
                  {planChart.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatAmount(Number(value), "XAF")}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Claims Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentClaims")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recentClaims.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t("noClaimsInRange")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("planName")}</th>
                    <th className="pb-3 font-medium">{t("groupLabel")}</th>
                    <th className="pb-3 font-medium">{t("eventTypeLabel")}</th>
                    <th className="pb-3 font-medium text-right">{t("amount")}</th>
                    <th className="pb-3 font-medium">{t("status")}</th>
                    <th className="pb-3 font-medium">{t("createdDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClaims.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3">{row.planName}</td>
                      <td className="py-3">{row.groupName}</td>
                      <td className="py-3 capitalize">{row.eventType}</td>
                      <td className="py-3 text-right">{row.amount}</td>
                      <td className="py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_STYLES[row.status] || "bg-muted text-muted-foreground"}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
