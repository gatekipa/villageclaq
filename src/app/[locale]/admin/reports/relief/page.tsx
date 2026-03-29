"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, DollarSign, Users, Calculator, AlertCircle,
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
  amount: string;
  status: string;
  date: string;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);

  const [activePlans, setActivePlans] = useState(0);
  const [totalDisbursed, setTotalDisbursed] = useState(0);
  const [beneficiaries, setBeneficiaries] = useState(0);
  const [avgClaim, setAvgClaim] = useState(0);
  const [disbursementChart, setDisbursementChart] = useState<MonthPoint[]>([]);
  const [planChart, setPlanChart] = useState<PlanSlice[]>([]);
  const [recentClaims, setRecentClaims] = useState<ClaimRow[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setIsEmpty(false);
    try {
      const supabase = createClient();
      const cutoff = getCutoffDate(timeRange).toISOString();

      const [plansRes, claimsRes, payoutsRes, enrollmentsRes] = await Promise.all([
        supabase.from("relief_plans").select("id, name, is_active"),
        supabase.from("relief_claims").select("id, plan_id, membership_id, status, amount, created_at").gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("relief_payouts").select("amount, created_at, claim_id").gte("created_at", cutoff),
        supabase.from("relief_enrollments").select("id", { count: "exact", head: true }),
      ]);

      const plans = plansRes.data || [];
      const claims = claimsRes.data || [];
      const payouts = payoutsRes.data || [];

      // Check empty state
      if (plans.length === 0 && claims.length === 0 && payouts.length === 0) {
        setIsEmpty(true);
        setLoading(false);
        return;
      }

      const activeCount = plans.filter((p) => p.is_active).length;
      setActivePlans(activeCount);

      const disbursed = payouts.reduce((s, p) => s + Number(p.amount), 0);
      setTotalDisbursed(disbursed);

      const uniqueBeneficiaries = new Set(claims.map((c) => c.membership_id));
      setBeneficiaries(uniqueBeneficiaries.size);

      setAvgClaim(claims.length > 0 ? claims.reduce((s, c) => s + Number(c.amount), 0) / claims.length : 0);

      // Monthly disbursement chart
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
        const dt = new Date(p.created_at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + Number(p.amount));
      }

      const dChart: MonthPoint[] = [];
      for (const [key, val] of monthMap) {
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
        dChart.push({ month: label, amount: val });
      }
      setDisbursementChart(dChart);

      // Relief by plan name (PieChart)
      const planNameMap = new Map<string, string>();
      for (const p of plans) planNameMap.set(p.id, p.name);

      const planAmountMap = new Map<string, number>();
      for (const c of claims) {
        const pName = planNameMap.get(c.plan_id) || "Unknown";
        planAmountMap.set(pName, (planAmountMap.get(pName) || 0) + Number(c.amount));
      }
      const pChart: PlanSlice[] = [];
      for (const [name, value] of planAmountMap) {
        pChart.push({ name, value });
      }
      setPlanChart(pChart);

      // Recent 5 claims
      const recent: ClaimRow[] = claims.slice(0, 5).map((c) => ({
        planName: planNameMap.get(c.plan_id) || "—",
        amount: formatAmount(c.amount, "XAF"),
        status: c.status,
        date: new Date(c.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }),
      }));
      setRecentClaims(recent);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [timeRange, dateLocale]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <AlertCircle className="h-16 w-16 mb-4 text-red-500" />
        <p>{t("noDataYet")}</p>
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
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-muted-foreground">
          <Shield className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg">{t("noReliefData")}</p>
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
                    <p className="text-sm text-muted-foreground">{t("beneficiaries")}</p>
                    <p className="text-2xl font-bold">{beneficiaries}</p>
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
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
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
            <p className="text-sm text-muted-foreground text-center py-6">{t("noReliefData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("planName")}</th>
                    <th className="pb-3 font-medium text-right">{t("amount")}</th>
                    <th className="pb-3 font-medium">{t("status")}</th>
                    <th className="pb-3 font-medium">{t("createdDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClaims.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3">{row.planName}</td>
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
