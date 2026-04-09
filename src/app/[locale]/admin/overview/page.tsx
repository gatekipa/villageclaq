"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Layers, Users, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function PlatformOverviewPage() {
  const locale = useLocale();
  const t = useTranslations("admin");

  const sixMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString();
  }, []);

  const thisMonthStart = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    []
  );

  const { results, loading, error } = useAdminQuery([
    { key: "groups", table: "groups", select: "created_at" },
    { key: "profiles", table: "profiles", select: "created_at" },
    {
      key: "eventsThisMonth",
      table: "events",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: thisMonthStart }],
    },
    {
      key: "monthlyEvents",
      table: "events",
      select: "created_at",
      filters: [{ column: "created_at", op: "gte", value: sixMonthsAgo }],
    },
    {
      key: "monthlyPayments",
      table: "payments",
      select: "created_at",
      filters: [{ column: "created_at", op: "gte", value: sixMonthsAgo }],
    },
  ]);

  const groups = (results.groups?.data ?? []) as Array<{ created_at: string }>;
  const profiles = (results.profiles?.data ?? []) as Array<{ created_at: string }>;
  const eventsThisMonth = results.eventsThisMonth?.count ?? 0;
  const monthlyEvents = (results.monthlyEvents?.data ?? []) as Array<{ created_at: string }>;
  const monthlyPayments = (results.monthlyPayments?.data ?? []) as Array<{ created_at: string }>;

  const growthData = useMemo(() => {
    const now = new Date();
    const months: Array<{ month: string; groups: number; users: number; events: number; contributions: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(getDateLocale(locale), { month: "short" });
      months.push({
        month: label,
        groups: groups.filter((g) => g.created_at?.slice(0, 7) === key).length,
        users: profiles.filter((p) => p.created_at?.slice(0, 7) === key).length,
        events: monthlyEvents.filter((e) => e.created_at?.slice(0, 7) === key).length,
        contributions: monthlyPayments.filter((p) => p.created_at?.slice(0, 7) === key).length,
      });
    }
    return months;
  }, [groups, profiles, monthlyEvents, monthlyPayments, locale]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 text-sm text-primary hover:underline">{t("retry")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("platformOverview")}</h1>
        <p className="text-muted-foreground">{t("overviewSubtitle")}</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("totalGroups"), value: groups.length, icon: Layers },
          { label: t("totalUsers"), value: profiles.length, icon: Users },
          { label: t("eventsThisMonth"), value: eventsThisMonth, icon: Calendar },
          { label: t("engagementIndex"), value: "—", icon: TrendingUp },
        ].map((card, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{card.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("groupGrowth")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[250px]" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={growthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="groups" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          )}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("userGrowth")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[250px]" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={growthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          )}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t("engagementIndex")}</CardTitle></CardHeader>
        <CardContent>{loading ? <Skeleton className="h-[250px]" /> : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={growthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="events" name={t("eventsCreated")} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="contributions" name={t("contributionsCreated")} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t("loginRecords")}</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground py-8 text-center">{t("loginTrackingRequired")}</p></CardContent>
      </Card>
    </div>
  );
}
