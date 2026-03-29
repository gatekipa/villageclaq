"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, TrendingUp, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface MonthPoint {
  month: string;
  count: number;
}

interface TypeSlice {
  name: string;
  value: number;
}

const TIME_RANGES = ["1m", "3m", "6m", "1y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

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

export default function MembershipReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [timeRange, setTimeRange] = useState<TimeRange>("6m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [totalUsers, setTotalUsers] = useState(0);
  const [newThisMonth, setNewThisMonth] = useState(0);
  const [netGrowth, setNetGrowth] = useState(0);
  const [userChart, setUserChart] = useState<MonthPoint[]>([]);
  const [groupChart, setGroupChart] = useState<MonthPoint[]>([]);
  const [typeChart, setTypeChart] = useState<TypeSlice[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      const cutoff = getCutoffDate(timeRange).toISOString();
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();

      const [allProfiles, monthProfiles, prevMonthProfiles, rangeProfiles, rangeGroups, allGroups] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", prevMonthStart).lt("created_at", thisMonthStart),
        supabase.from("profiles").select("created_at").gte("created_at", cutoff),
        supabase.from("groups").select("created_at").gte("created_at", cutoff),
        supabase.from("groups").select("group_type"),
      ]);

      const total = allProfiles.count || 0;
      const newMonth = monthProfiles.count || 0;
      const prevMonth = prevMonthProfiles.count || 0;

      setTotalUsers(total);
      setNewThisMonth(newMonth);
      setNetGrowth(newMonth - prevMonth);

      // User signups by month
      const cutoffDate = getCutoffDate(timeRange);
      const now = new Date();
      const userMonthMap = new Map<string, number>();
      const groupMonthMap = new Map<string, number>();

      const d = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
      while (d <= now) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        userMonthMap.set(key, 0);
        groupMonthMap.set(key, 0);
        d.setMonth(d.getMonth() + 1);
      }

      for (const p of rangeProfiles.data || []) {
        const dt = new Date(p.created_at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (userMonthMap.has(key)) userMonthMap.set(key, (userMonthMap.get(key) || 0) + 1);
      }

      for (const g of rangeGroups.data || []) {
        const dt = new Date(g.created_at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (groupMonthMap.has(key)) groupMonthMap.set(key, (groupMonthMap.get(key) || 0) + 1);
      }

      const userC: MonthPoint[] = [];
      const groupC: MonthPoint[] = [];
      for (const [key] of userMonthMap) {
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
        userC.push({ month: label, count: userMonthMap.get(key) || 0 });
        groupC.push({ month: label, count: groupMonthMap.get(key) || 0 });
      }
      setUserChart(userC);
      setGroupChart(groupC);

      // Groups by type
      const typeMap = new Map<string, number>();
      for (const g of allGroups.data || []) {
        const gt = (g.group_type as string) || "general";
        typeMap.set(gt, (typeMap.get(gt) || 0) + 1);
      }
      const types: TypeSlice[] = [];
      for (const [name, value] of typeMap) {
        types.push({ name, value });
      }
      setTypeChart(types);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("membershipReports")}</h1>
          <p className="text-sm text-muted-foreground">{t("membershipReportsDesc")}</p>
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
                    <p className="text-sm text-muted-foreground">{t("totalUsers")}</p>
                    <p className="text-2xl font-bold">{totalUsers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("newThisMonth")}</p>
                    <p className="text-2xl font-bold">{newThisMonth}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <UserMinus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("churned")}</p>
                    <p className="text-2xl font-bold">&mdash;</p>
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
                    <p className="text-sm text-muted-foreground">{t("netGrowth")}</p>
                    <p className="text-2xl font-bold">
                      {netGrowth > 0 ? "+" : ""}{netGrowth}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* User Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("userGrowthChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : userChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={userChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Group Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("groupGrowthChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : groupChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={groupChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Groups by Type PieChart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("groupsByType")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : typeChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("noDataYet")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeChart}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {typeChart.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
