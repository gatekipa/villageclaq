"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { Activity, Users, Info, Calendar, CreditCard, Heart, ClipboardList } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

export default function UsageAnalyticsPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [featureData, setFeatureData] = useState<Array<{ name: string; count: number }>>([]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      const [usersRes, attendanceRes, paymentsRes, eventsRes, membersRes, reliefRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("event_attendances").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
        supabase.from("payments").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
        supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
        supabase.from("memberships").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
        supabase.from("relief_claims").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
      ]);

      setTotalUsers(usersRes.count || 0);
      setFeatureData([
        { name: "Attendance", count: attendanceRes.count || 0 },
        { name: "Payments", count: paymentsRes.count || 0 },
        { name: "Events", count: eventsRes.count || 0 },
        { name: "Members Added", count: membersRes.count || 0 },
        { name: "Relief Claims", count: reliefRes.count || 0 },
      ]);
      setLoading(false);
    }
    fetchData();
  }, []);

  const unavailableMetrics = [
    "Avg Session Duration",
    "Pages per Session",
    "Bounce Rate",
    "Device Breakdown",
    "Geographic Distribution",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("usageAnalytics")}</h1>
        <p className="text-muted-foreground">{t("analyticsSubtitle")}</p>
      </div>

      {/* Available Metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalUsers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{totalUsers}</div>}</CardContent>
        </Card>
        {unavailableMetrics.slice(0, 2).map((metric) => (
          <Card key={metric}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{metric}</CardTitle>
              <Info className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{t("requiresAnalytics")}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Feature Usage Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("featureUsage")} (30d)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[300px]" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={featureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <RTooltip />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Unavailable Metrics */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" /> {t("requiresAnalytics")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unavailableMetrics.map((metric) => (
              <div key={metric} className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border p-3">
                <Info className="h-4 w-4 shrink-0 text-blue-500" />
                <span>{metric}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">PostHog, Mixpanel, or similar analytics integration needed.</p>
        </CardContent>
      </Card>
    </div>
  );
}
