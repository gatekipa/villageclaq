"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/currencies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/routing";
import {
  DollarSign, Activity, Users, Calendar, Heart, ArrowRight,
  BarChart3, AlertCircle,
} from "lucide-react";

interface ReportCard {
  key: string;
  href: string;
  icon: typeof DollarSign;
  color: string;
  descKey: string;
  metric1: { label: string; value: string | number };
  metric2: { label: string; value: string | number };
}

export default function ReportsHubPage() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0, revenueThisMonth: 0, totalUsers: 0, newUsersMonth: 0,
    totalEvents: 0, avgAttendance: "—" as string | number,
    activePlans: 0, totalDisbursed: 0, activeGroups: 0,
  });

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const supabase = createClient();
        const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [paymentsAll, paymentsMonth, profiles, profilesMonth, events, attendances, relief, payouts, groups] = await Promise.all([
          supabase.from("payments").select("amount").then((r) => r.data || []),
          supabase.from("payments").select("amount").gte("recorded_at", thisMonthStart).then((r) => r.data || []),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart),
          supabase.from("events").select("id", { count: "exact", head: true }),
          supabase.from("event_attendances").select("status"),
          supabase.from("relief_plans").select("id", { count: "exact", head: true }).eq("is_active", true),
          supabase.from("relief_payouts").select("amount").then((r) => r.data || []),
          supabase.from("groups").select("id", { count: "exact", head: true }).eq("is_active", true),
        ]);

        const totalRev = paymentsAll.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);
        const monthRev = paymentsMonth.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);
        const attData = attendances.data || [];
        const presentCount = attData.filter((a: Record<string, unknown>) => a.status === "present" || a.status === "late").length;
        const avgAtt = attData.length > 0 ? Math.round((presentCount / attData.length) * 100) : "—";
        const disbursed = payouts.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);

        setMetrics({
          totalRevenue: totalRev, revenueThisMonth: monthRev,
          totalUsers: profiles.count || 0, newUsersMonth: profilesMonth.count || 0,
          totalEvents: events.count || 0, avgAttendance: avgAtt,
          activePlans: relief.count || 0, totalDisbursed: disbursed,
          activeGroups: groups.count || 0,
        });
      } catch { /* best effort */ }
      finally { setLoading(false); }
    }
    fetchMetrics();
  }, []);

  const cards: ReportCard[] = [
    {
      key: "financial", href: "/admin/reports/financial", icon: DollarSign,
      color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      descKey: "financialReportsDesc",
      metric1: { label: t("totalRevenue"), value: formatAmount(metrics.totalRevenue, "XAF") },
      metric2: { label: t("thisMonth"), value: formatAmount(metrics.revenueThisMonth, "XAF") },
    },
    {
      key: "engagement", href: "/admin/reports/engagement", icon: Activity,
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      descKey: "engagementReportsDesc",
      metric1: { label: t("activeUsers"), value: metrics.totalUsers },
      metric2: { label: t("avgSession"), value: "—" },
    },
    {
      key: "membership", href: "/admin/reports/membership", icon: Users,
      color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
      descKey: "membershipReportsDesc",
      metric1: { label: t("totalUsers"), value: metrics.totalUsers },
      metric2: { label: t("newThisMonth"), value: metrics.newUsersMonth },
    },
    {
      key: "attendance", href: "/admin/reports/attendance", icon: Calendar,
      color: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
      descKey: "attendanceReportsDesc",
      metric1: { label: t("totalEventsR"), value: metrics.totalEvents },
      metric2: { label: t("avgAttendanceRate"), value: typeof metrics.avgAttendance === "number" ? `${metrics.avgAttendance}%` : "—" },
    },
    {
      key: "relief", href: "/admin/reports/relief", icon: Heart,
      color: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
      descKey: "reliefReportsDesc",
      metric1: { label: t("activePlans"), value: metrics.activePlans },
      metric2: { label: t("totalDisbursed"), value: formatAmount(metrics.totalDisbursed, "XAF") },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reportsAndAnalytics")}</h1>
        <p className="text-muted-foreground">{t("reportsAndAnalyticsDesc")}</p>
      </div>

      {/* Report Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.key} href={card.href}>
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-base mt-3">{t(`${card.key}Reports` as Parameters<typeof t>[0])}</CardTitle>
                <p className="text-xs text-muted-foreground">{t(card.descKey as Parameters<typeof t>[0])}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {[card.metric1, card.metric2].map((m, i) => (
                    <div key={i}>
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      {loading ? <Skeleton className="h-5 w-16 mt-0.5" /> : (
                        <p className="text-sm font-bold">{m.value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Platform Summary Bar */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t("platformSummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: t("totalGroups"), value: metrics.activeGroups },
              { label: t("totalUsers"), value: metrics.totalUsers },
              { label: t("monthlyRevenue"), value: formatAmount(metrics.revenueThisMonth, "XAF") },
              { label: t("totalEventsR"), value: metrics.totalEvents },
              { label: t("avgAttendanceRate"), value: typeof metrics.avgAttendance === "number" ? `${metrics.avgAttendance}%` : "—" },
              { label: t("totalDisbursed"), value: formatAmount(metrics.totalDisbursed, "XAF") },
            ].map((m, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                {loading ? <Skeleton className="h-5 w-12 mx-auto mt-1" /> : (
                  <p className="text-sm font-bold">{m.value}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
