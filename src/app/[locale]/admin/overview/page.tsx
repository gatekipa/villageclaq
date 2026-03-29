"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { Layers, Users, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function PlatformOverviewPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Array<{ created_at: string }>>([]);
  const [profiles, setProfiles] = useState<Array<{ created_at: string }>>([]);
  const [eventsThisMonth, setEventsThisMonth] = useState(0);
  const [monthlyEvents, setMonthlyEvents] = useState<Array<{ created_at: string }>>([]);
  const [monthlyPayments, setMonthlyPayments] = useState<Array<{ created_at: string }>>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [groupsRes, profilesRes, eventsMonthRes, eventsAllRes, paymentsRes] = await Promise.all([
          supabase.from("groups").select("created_at"),
          supabase.from("profiles").select("created_at"),
          supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart),
          supabase.from("events").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
          supabase.from("payments").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
        ]);

        setGroups(groupsRes.data || []);
        setProfiles(profilesRes.data || []);
        setEventsThisMonth(eventsMonthRes.count || 0);
        setMonthlyEvents(eventsAllRes.data || []);
        setMonthlyPayments(paymentsRes.data || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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
        <button onClick={() => window.location.reload()} className="mt-4 text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("platformOverview")}</h1>
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
