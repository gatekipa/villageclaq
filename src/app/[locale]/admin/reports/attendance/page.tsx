"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Users, TrendingUp, BarChart3, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

interface MonthPoint {
  month: string;
  rate: number;
}

interface DayPoint {
  day: string;
  count: number;
}

interface EventRow {
  title: string;
  date: string;
  attended: number;
  total: number;
  rate: string;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const DAY_NAMES = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;

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

export default function AttendanceReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const cutoff = useMemo(() => getCutoffDate(timeRange).toISOString(), [timeRange]);

  const { results, loading, error } = useAdminQuery([
    {
      key: "events",
      table: "events",
      select: "id, title, starts_at",
      filters: [{ column: "starts_at", op: "gte", value: cutoff }],
      order: { column: "starts_at", ascending: false },
    },
    {
      key: "attendances",
      table: "event_attendances",
      select: "event_id, status, created_at",
    },
  ]);

  const { totalEvents, totalAttendees, avgRate, monthlyChart, dayChart, recentEvents } = useMemo(() => {
    const events = (results.events?.data ?? []) as Array<Record<string, unknown>>;
    const attendances = (results.attendances?.data ?? []) as Array<Record<string, unknown>>;

    // Build attendance map by event_id
    const attByEvent = new Map<string, { present: number; total: number }>();
    for (const a of attendances) {
      const eid = a.event_id as string;
      if (!attByEvent.has(eid)) attByEvent.set(eid, { present: 0, total: 0 });
      const bucket = attByEvent.get(eid)!;
      bucket.total += 1;
      if (a.status === "present" || a.status === "late") bucket.present += 1;
    }

    // Filter to events in range
    const cutoffDate = getCutoffDate(timeRange);
    const eventsInRange = events.filter((e) => new Date(e.starts_at as string) >= cutoffDate);

    let totalPresent = 0;
    let totalAll = 0;
    for (const e of eventsInRange) {
      const data = attByEvent.get(e.id as string);
      if (data) {
        totalPresent += data.present;
        totalAll += data.total;
      }
    }

    // Monthly attendance rate
    const now = new Date();
    const monthMap = new Map<string, { present: number; total: number }>();
    const d = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    while (d <= now) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { present: 0, total: 0 });
      d.setMonth(d.getMonth() + 1);
    }

    for (const e of eventsInRange) {
      const dt = new Date(e.starts_at as string);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthMap.get(key);
      const att = attByEvent.get(e.id as string);
      if (bucket && att) {
        bucket.present += att.present;
        bucket.total += att.total;
      }
    }

    const mChart: MonthPoint[] = [];
    for (const [key, val] of monthMap) {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
      mChart.push({ month: label, rate: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0 });
    }

    // Attendance by day of week
    const dayBuckets = [0, 0, 0, 0, 0, 0, 0];
    for (const e of eventsInRange) {
      const dt = new Date(e.starts_at as string);
      const jsDay = dt.getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      const att = attByEvent.get(e.id as string);
      if (att) dayBuckets[idx] += att.present;
    }

    const dChart: DayPoint[] = DAY_NAMES.map((key, i) => ({
      day: t(key),
      count: dayBuckets[i],
    }));

    // Recent 5 events
    const recent: EventRow[] = eventsInRange.slice(0, 5).map((e) => {
      const att = attByEvent.get(e.id as string) || { present: 0, total: 0 };
      return {
        title: e.title as string,
        date: new Date(e.starts_at as string).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }),
        attended: att.present,
        total: att.total,
        rate: att.total > 0 ? `${Math.round((att.present / att.total) * 100)}%` : "0%",
      };
    });

    return {
      totalEvents: eventsInRange.length,
      totalAttendees: totalPresent,
      avgRate: totalAll > 0 ? Math.round((totalPresent / totalAll) * 100) : 0,
      monthlyChart: mChart,
      dayChart: dChart,
      recentEvents: recent,
    };
  }, [results, timeRange, dateLocale, t]);

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
          <h1 className="text-2xl font-bold">{t("attendanceReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("attendanceReportsDesc")}</p>
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
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("totalEventsR")}</p>
                    <p className="text-2xl font-bold">{totalEvents}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("totalAttendees")}</p>
                    <p className="text-2xl font-bold">{totalAttendees}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("avgAttendanceRate")}</p>
                    <p className="text-2xl font-bold">{avgRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("participationGrowth")}</p>
                    <p className="text-2xl font-bold">&mdash;</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Monthly Attendance Rate Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("attendanceTrend")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : monthlyChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip
                  formatter={(value) => [`${value}%`, t("avgAttendanceRate")]}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Attendance by Day of Week */}
      <Card>
        <CardHeader>
          <CardTitle>{t("attendanceByDay")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentEvents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("noDataYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t("eventTitle")}</th>
                    <th className="pb-3 font-medium">{t("eventDate")}</th>
                    <th className="pb-3 font-medium text-right">{t("attended")}</th>
                    <th className="pb-3 font-medium text-right">{t("avgAttendanceRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3">{row.title}</td>
                      <td className="py-3">{row.date}</td>
                      <td className="py-3 text-right">{row.attended}/{row.total}</td>
                      <td className="py-3 text-right font-medium">{row.rate}</td>
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
