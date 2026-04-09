"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Users, Calendar, CreditCard, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

interface FeatureRow {
  feature: string;
  count: number;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

function getCutoffDate(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "1m": return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3m": return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6m": return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1y": return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
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

export default function EngagementReportsPage() {
  const t = useTranslations("admin");

  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const cutoff = useMemo(() => getCutoffDate(timeRange).toISOString(), [timeRange]);

  const { results, loading, error } = useAdminQuery([
    { key: "profiles", table: "profiles", select: "id", count: "exact", limit: 1 },
    {
      key: "attendances",
      table: "event_attendances",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
    },
    {
      key: "payments",
      table: "payments",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "recorded_at", op: "gte", value: cutoff }],
    },
    {
      key: "events",
      table: "events",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
    },
    {
      key: "memberships",
      table: "memberships",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
    },
    {
      key: "reliefClaims",
      table: "relief_claims",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: cutoff }],
    },
  ]);

  const totalUsers = results.profiles?.count ?? 0;

  const featureData: FeatureRow[] = useMemo(() => [
    { feature: t("attendanceReports"), count: results.attendances?.count ?? 0 },
    { feature: t("totalPayments"), count: results.payments?.count ?? 0 },
    { feature: t("totalEventsR"), count: results.events?.count ?? 0 },
    { feature: t("membershipReports"), count: results.memberships?.count ?? 0 },
    { feature: t("reliefPlanReports"), count: results.reliefClaims?.count ?? 0 },
  ], [results, t]);

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
          <h1 className="text-2xl font-bold">{t("engagementReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("engagementReportsDesc")}</p>
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
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("activeUsers")}</p>
                    <p className="text-2xl font-bold">{totalUsers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("avgSession")}</p>
                    <p className="text-2xl font-bold text-muted-foreground">{t("requiresAnalytics")}</p>
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
                    <p className="text-sm text-muted-foreground">{t("pagesPerSession")}</p>
                    <p className="text-2xl font-bold text-muted-foreground">{t("requiresAnalytics")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("engagementScore")}</p>
                    <p className="text-2xl font-bold">&mdash;</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Feature Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("featureUsage")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : featureData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={featureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="feature" type="category" width={130} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Feature Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("featureDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("featureUsage")}</th>
                    <th className="pb-3 font-medium text-right">{t("txnCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {featureData.map((row) => (
                    <tr key={row.feature} className="border-b last:border-0">
                      <td className="py-3">{row.feature}</td>
                      <td className="py-3 text-right font-medium">{row.count}</td>
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
