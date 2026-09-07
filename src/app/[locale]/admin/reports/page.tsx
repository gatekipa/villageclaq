"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { bucketCurrencyAmounts, formatCurrencyBuckets } from "@/lib/currency-buckets";
import { isConfirmedPayment } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
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

  const thisMonthStart = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    []
  );

  const { results, loading } = useAdminQuery([
    { key: "paymentsAll", table: "payments", select: "amount, currency, status" },
    {
      key: "paymentsMonth",
      table: "payments",
      select: "amount, currency, status",
      filters: [{ column: "recorded_at", op: "gte", value: thisMonthStart }],
    },
    { key: "profiles", table: "profiles", select: "id", count: "exact", limit: 1 },
    {
      key: "profilesMonth",
      table: "profiles",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "created_at", op: "gte", value: thisMonthStart }],
    },
    { key: "events", table: "events", select: "id", count: "exact", limit: 1 },
    { key: "attendances", table: "event_attendances", select: "status" },
    {
      key: "relief",
      table: "relief_plans",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "is_active", op: "eq", value: true }],
    },
    { key: "payouts", table: "relief_payouts", select: "amount, relief_claims!inner(relief_plans!inner(groups!inner(currency)))" },
    {
      key: "groups",
      table: "groups",
      select: "id",
      count: "exact",
      limit: 1,
      filters: [{ column: "is_active", op: "eq", value: true }],
    },
  ]);

  const metrics = useMemo(() => {
    const paymentsAll = (results.paymentsAll?.data ?? []) as Array<Record<string, unknown>>;
    const paymentsMonth = (results.paymentsMonth?.data ?? []) as Array<Record<string, unknown>>;
    const attData = (results.attendances?.data ?? []) as Array<Record<string, unknown>>;
    const payoutsData = (results.payouts?.data ?? []) as Array<Record<string, unknown>>;

    const confirmedPayments = paymentsAll.filter((payment) => isConfirmedPayment(payment.status as string | null));
    const confirmedMonth = paymentsMonth.filter((payment) => isConfirmedPayment(payment.status as string | null));
    const totalRev = bucketCurrencyAmounts(confirmedPayments, (payment) => Number(payment.amount), (payment) => payment.currency as string | null);
    const monthRev = bucketCurrencyAmounts(confirmedMonth, (payment) => Number(payment.amount), (payment) => payment.currency as string | null);
    const presentCount = attData.filter((a) => a.status === "present" || a.status === "late").length;
    const avgAtt = attData.length > 0 ? Math.round((presentCount / attData.length) * 100) : ("—" as string | number);
    const disbursed = bucketCurrencyAmounts(
      payoutsData,
      (payout) => Number(payout.amount),
      (payout) => {
        const one = (value: unknown): Record<string, unknown> | null =>
          (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
        const claim = one(payout.relief_claims);
        const plan = one(claim?.relief_plans);
        const group = one(plan?.groups);
        return group?.currency as string | null;
      },
    );

    return {
      totalRevenue: totalRev,
      revenueThisMonth: monthRev,
      totalUsers: results.profiles?.count ?? 0,
      newUsersMonth: results.profilesMonth?.count ?? 0,
      totalEvents: results.events?.count ?? 0,
      avgAttendance: avgAtt,
      activePlans: results.relief?.count ?? 0,
      totalDisbursed: disbursed,
      activeGroups: results.groups?.count ?? 0,
    };
  }, [results]);

  const cards: ReportCard[] = [
    {
      key: "financial", href: "/admin/reports/financial", icon: DollarSign,
      color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      descKey: "financialReportsDesc",
      metric1: { label: t("totalRevenue"), value: formatCurrencyBuckets(metrics.totalRevenue).join(" · ") },
      metric2: { label: t("thisMonth"), value: formatCurrencyBuckets(metrics.revenueThisMonth).join(" · ") },
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
      metric2: { label: t("totalDisbursed"), value: formatCurrencyBuckets(metrics.totalDisbursed).join(" · ") },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("reportsAndAnalytics")}</h1>
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
              { label: t("monthlyRevenue"), value: formatCurrencyBuckets(metrics.revenueThisMonth).join(" · ") },
              { label: t("totalEventsR"), value: metrics.totalEvents },
              { label: t("avgAttendanceRate"), value: typeof metrics.avgAttendance === "number" ? `${metrics.avgAttendance}%` : "—" },
              { label: t("totalDisbursed"), value: formatCurrencyBuckets(metrics.totalDisbursed).join(" · ") },
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
