"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { bucketCurrencyAmounts, formatCurrencyBuckets, type CurrencyAmountBucket } from "@/lib/currency-buckets";
import { isConfirmedPayment } from "@/lib/money";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, CreditCard, Calculator, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

interface MonthlyRow {
  period: string;
  currency: string;
  count: number;
  total: number;
  avg: number;
}

interface ChartPoint {
  month: string;
  currency: string;
  revenue: number;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

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

export default function FinancialReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const cutoff = useMemo(() => getCutoffDate(timeRange).toISOString(), [timeRange]);
  const thisMonthStart = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    []
  );

  const { results, loading, error } = useAdminQuery([
    {
      key: "allPayments",
      table: "payments",
      select: "amount, currency, status, recorded_at, payment_method",
      filters: [{ column: "recorded_at", op: "gte", value: cutoff }],
    },
    {
      key: "monthPayments",
      table: "payments",
      select: "amount, currency, status",
      filters: [{ column: "recorded_at", op: "gte", value: thisMonthStart }],
    },
  ]);

  const { totalRevenue, revenueThisMonth, avgTransaction, chartData, tableData } = useMemo(() => {
    const payments = ((results.allPayments?.data ?? []) as Array<Record<string, unknown>>)
      .filter((payment) => isConfirmedPayment(payment.status as string | null));
    const monthPays = ((results.monthPayments?.data ?? []) as Array<Record<string, unknown>>)
      .filter((payment) => isConfirmedPayment(payment.status as string | null));

    const total = bucketCurrencyAmounts(payments, (payment) => Number(payment.amount), (payment) => payment.currency as string | null);
    const monthTotal = bucketCurrencyAmounts(monthPays, (payment) => Number(payment.amount), (payment) => payment.currency as string | null);
    const counts = new Map<string, number>();
    for (const payment of payments) {
      const code = String(payment.currency || "").toUpperCase();
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    }
    const avg: CurrencyAmountBucket[] = total.map((bucket) => ({
      currency: bucket.currency,
      amount: counts.get(bucket.currency) ? bucket.amount / counts.get(bucket.currency)! : 0,
    }));

    // Group by month for chart and table
    const monthMap = new Map<string, { period: string; currency: string; count: number; total: number }>();
    const cutoffDate = getCutoffDate(timeRange);
    const now = new Date();
    const d = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    while (d <= now) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      for (const currency of [...counts.keys()].sort()) {
        monthMap.set(`${key}:${currency}`, { period: key, currency, count: 0, total: 0 });
      }
      d.setMonth(d.getMonth() + 1);
    }

    for (const p of payments) {
      const dt = new Date(p.recorded_at as string);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const currency = String(p.currency || "").toUpperCase();
      const bucket = monthMap.get(`${key}:${currency}`);
      if (bucket) {
        bucket.count += 1;
        bucket.total += Number(p.amount);
      }
    }

    const chart: ChartPoint[] = [];
    const table: MonthlyRow[] = [];

    for (const val of monthMap.values()) {
      const [y, m] = val.period.split("-");
      const dt = new Date(Number(y), Number(m) - 1, 1);
      const label = dt.toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
      chart.push({ month: `${label} · ${val.currency}`, currency: val.currency, revenue: val.total });
      table.push({
        period: label,
        currency: val.currency,
        count: val.count,
        total: val.total,
        avg: val.count > 0 ? val.total / val.count : 0,
      });
    }

    return { totalRevenue: total, revenueThisMonth: monthTotal, avgTransaction: avg, chartData: chart, tableData: table };
  }, [results, timeRange, dateLocale]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <AlertCircle className="h-16 w-16 mb-4 text-red-500" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("financialReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("financialReportsDesc")}</p>
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
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("totalRevenue")}</p>
                    <div className="space-y-0.5">{formatCurrencyBuckets(totalRevenue).map((value) => <p key={value} className="text-xl font-bold">{value}</p>)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("revenueThisMonth")}</p>
                    <div className="space-y-0.5">{formatCurrencyBuckets(revenueThisMonth).map((value) => <p key={value} className="text-xl font-bold">{value}</p>)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("revenueByType")}</p>
                    <div className="space-y-0.5">{formatCurrencyBuckets(totalRevenue).map((value) => <p key={value} className="text-xl font-bold">{value}</p>)}</div>
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
                    <p className="text-sm text-muted-foreground">{t("avgTransaction")}</p>
                    <div className="space-y-0.5">{formatCurrencyBuckets(avgTransaction).map((value) => <p key={value} className="text-xl font-bold">{value}</p>)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("revenueTrend")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, _name, item) => [formatAmount(Number(value), String((item.payload as ChartPoint).currency)), t("monthlyRevenue")]}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Transaction Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("transactionSummary")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : tableData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("noDataYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("period")}</th>
                    <th className="pb-3 font-medium">Currency</th>
                    <th className="pb-3 font-medium text-right">{t("txnCount")}</th>
                    <th className="pb-3 font-medium text-right">{t("totalRevenue")}</th>
                    <th className="pb-3 font-medium text-right">{t("avgTxn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row) => (
                    <tr key={`${row.period}:${row.currency}`} className="border-b last:border-0">
                      <td className="py-3">{row.period}</td>
                      <td className="py-3">{row.currency}</td>
                      <td className="py-3 text-right">{row.count}</td>
                      <td className="py-3 text-right">{formatAmount(row.total, row.currency)}</td>
                      <td className="py-3 text-right">{formatAmount(row.avg, row.currency)}</td>
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
