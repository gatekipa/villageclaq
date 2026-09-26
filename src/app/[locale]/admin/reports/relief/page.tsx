"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/currencies";
import { useAdminReliefAggregate, type ReliefAggregate } from "@/lib/hooks/use-admin-relief-aggregate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, Calculator, AlertCircle, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];
const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

function groupByCurrency(plans: ReliefAggregate[]) {
  const grouped = new Map<string, ReliefAggregate[]>();
  for (const plan of plans) {
    const bucket = grouped.get(plan.currency) ?? [];
    bucket.push(plan);
    grouped.set(plan.currency, bucket);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b));
}

export default function ReliefReportsPage() {
  const t = useTranslations("admin");
  const [timeRange, setTimeRange] = useState<TimeRange>("6m");
  const { plans, loading, error } = useAdminReliefAggregate(timeRange);
  const activePlans = plans.filter((plan) => plan.is_active).length;
  const enrollments = plans.reduce((sum, plan) => sum + Number(plan.active_enrollments), 0);
  const claims = plans.reduce((sum, plan) => sum + Number(plan.claims_since), 0);
  const currencies = groupByCurrency(plans);

  if (error) return (
    <div className="flex min-h-[60vh] items-center justify-center gap-3 text-muted-foreground">
      <AlertCircle className="h-8 w-8 text-red-500" />{error}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("reliefPlanReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("reliefReportsDesc")}</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
          {TIME_RANGES.map((range) => (
            <button key={range} onClick={() => setTimeRange(range)}
              className={`rounded-md px-3 py-1.5 text-sm ${timeRange === range
                ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
              {t(range === "1m" ? "oneMonth" : range === "3m" ? "threeMonths"
                : range === "6m" ? "sixMonths" : "oneYear")}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Skeleton className="h-40 w-full" /> : plans.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 p-12 text-muted-foreground">
          <Info className="h-8 w-8" /><p>{t("noReliefData")}</p>
        </CardContent></Card>
      ) : <>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-6">
            <Shield className="h-6 w-6 text-emerald-600" />
            <div><p className="text-sm text-muted-foreground">{t("activePlans")}</p>
              <p className="text-2xl font-bold">{activePlans}</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-6">
            <Users className="h-6 w-6 text-blue-600" />
            <div><p className="text-sm text-muted-foreground">{t("enrolledBeneficiaries")}</p>
              <p className="text-2xl font-bold">{enrollments}</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-6">
            <Calculator className="h-6 w-6 text-orange-600" />
            <div><p className="text-sm text-muted-foreground">{t("claimsLabel")}</p>
              <p className="text-2xl font-bold">{claims}</p></div>
          </CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>{t("fundsByGroup")}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-3 font-medium">{t("groupLabel")}</th>
                <th className="pb-3 font-medium">{t("planName")}</th>
                <th className="pb-3 font-medium text-right">{t("contribution")}</th>
                <th className="pb-3 font-medium text-right">{t("enrolledLabel")}</th>
                <th className="pb-3 font-medium text-right">{t("claimsLabel")}</th>
                <th className="pb-3 font-medium text-right">{t("totalDisbursed")}</th>
                <th className="pb-3 font-medium">{t("status")}</th>
              </tr></thead>
              <tbody>{plans.map((plan) => (
                <tr key={plan.plan_id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{plan.group_name}</td>
                  <td className="py-3">{plan.plan_name}</td>
                  <td className="py-3 text-right">{formatAmount(Number(plan.contribution_amount), plan.currency)}</td>
                  <td className="py-3 text-right">{plan.active_enrollments}</td>
                  <td className="py-3 text-right">{plan.claims_since}</td>
                  <td className="py-3 text-right">{formatAmount(Number(plan.payouts_since), plan.currency)}</td>
                  <td className="py-3"><Badge variant="secondary">
                    {plan.is_active ? t("statusActive") : t("disabled")}
                  </Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
        {currencies.map(([currency, currencyPlans]) => {
          const claimCount = currencyPlans.reduce((sum, plan) =>
            sum + Number(plan.claims_since), 0);
          const claimAmount = currencyPlans.reduce((sum, plan) =>
            sum + Number(plan.claim_amount_since), 0);
          const payoutAmount = currencyPlans.reduce((sum, plan) =>
            sum + Number(plan.payouts_since), 0);
          const months = new Map<string, number>();
          for (const plan of currencyPlans) for (const point of plan.payouts_by_month) {
            months.set(point.month, (months.get(point.month) ?? 0) + Number(point.amount));
          }
          const monthly = [...months].sort(([a], [b]) => a.localeCompare(b))
            .map(([month, amount]) => ({ month, amount }));
          const byPlan = currencyPlans.filter((plan) => Number(plan.claim_amount_since) > 0)
            .map((plan) => ({ name: plan.plan_name, value: Number(plan.claim_amount_since) }));
          return <div key={currency} className="space-y-4">
            <h2 className="text-lg font-semibold">{currency}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card><CardContent className="p-6">
                <p className="text-sm text-muted-foreground">{t("totalDisbursed")}</p>
                <p className="text-2xl font-bold">{formatAmount(payoutAmount, currency)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-6">
                <p className="text-sm text-muted-foreground">{t("avgClaim")}</p>
                <p className="text-2xl font-bold">{formatAmount(
                  claimCount ? claimAmount / claimCount : 0, currency)}</p>
              </CardContent></Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>{t("disbursementTrend")}</CardTitle></CardHeader>
                <CardContent>{monthly.length ? <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={monthly}><CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" /><YAxis />
                    <Tooltip formatter={(value) => formatAmount(Number(value), currency)} />
                    <Area dataKey="amount" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer> : <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("noDataYet")}</p>}</CardContent>
              </Card>
              <Card><CardHeader><CardTitle>{t("reliefByType")}</CardTitle></CardHeader>
                <CardContent>{byPlan.length ? <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={byPlan} dataKey="value" nameKey="name" outerRadius={85}>
                    {byPlan.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie><Tooltip formatter={(value) => formatAmount(Number(value), currency)} />
                    <Legend /></PieChart>
                </ResponsiveContainer> : <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("noClaimsInRange")}</p>}</CardContent>
              </Card>
            </div>
          </div>;
        })}
      </>}
    </div>
  );
}
