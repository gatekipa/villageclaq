"use client";
import { formatAmount } from "@/lib/currencies";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  HandCoins,
  CreditCard,
  History,
  Grid3X3,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useObligations, usePayments, useContributionTypes } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

function formatCurrency(amount: number, currency: string) {
  return formatAmount(amount, currency);
}

function formatCompact(amount: number) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
}

export default function FinancesPage() {
  const t = useTranslations();
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";

  const { data: allObligations, isLoading: oblLoading, isError: oblError, refetch: oblRefetch } = useObligations();
  const { data: allPayments, isLoading: payLoading, isError: payError } = usePayments(200);
  const { data: contributionTypes } = useContributionTypes();

  const isLoading = oblLoading || payLoading;
  const isError = oblError || payError;

  // Compute stats from real data
  const stats = useMemo(() => {
    const obligations = allObligations || [];
    const payments = allPayments || [];

    const totalDue = obligations.reduce((sum, o) => sum + Number(o.amount), 0);
    const totalPaidOnObligations = obligations.reduce((sum, o) => sum + Number(o.amount_paid), 0);
    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalOutstanding = totalDue - totalPaidOnObligations;
    const collectionRate = totalDue > 0 ? Math.round((totalPaidOnObligations / totalDue) * 100) : 0;

    // This month's payments
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    let collectedThisMonth = 0;
    let collectedLastMonth = 0;
    let paymentsThisMonth = 0;

    for (const p of payments) {
      const pMonth = (p.recorded_at || p.created_at || "").slice(0, 7);
      if (pMonth === thisMonthKey) {
        collectedThisMonth += Number(p.amount);
        paymentsThisMonth++;
      } else if (pMonth === lastMonthKey) {
        collectedLastMonth += Number(p.amount);
      }
    }

    return { totalCollected, totalOutstanding, collectionRate, collectedThisMonth, collectedLastMonth, paymentsThisMonth };
  }, [allObligations, allPayments]);

  // Monthly trend: group payments by month (last 6 months)
  const monthlyTrend = useMemo(() => {
    const payments = allPayments || [];
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: monthNames[d.getMonth()],
      });
    }

    const monthMap = new Map<string, number>();
    for (const m of months) monthMap.set(m.key, 0);

    for (const p of payments) {
      const pMonth = (p.recorded_at || p.created_at || "").slice(0, 7);
      if (monthMap.has(pMonth)) {
        monthMap.set(pMonth, (monthMap.get(pMonth) || 0) + Number(p.amount));
      }
    }

    return months.map((m) => ({ month: m.label, amount: monthMap.get(m.key) || 0 }));
  }, [allPayments]);

  // Top overdue members: group pending obligations by membership
  const topOverdue = useMemo(() => {
    const obligations = allObligations || [];
    const pending = obligations.filter((o) => o.status === "pending" || o.status === "overdue" || o.status === "partial");
    const memberMap = new Map<string, { name: string; amount: number; obligations: number }>();

    for (const obl of pending) {
      const membership = obl.membership as { id: string; profiles: { full_name: string } | { full_name: string }[] };
      const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
      const mid = membership.id;
      const outstanding = Number(obl.amount) - Number(obl.amount_paid);

      if (!memberMap.has(mid)) {
        memberMap.set(mid, { name: profile?.full_name || "Unknown", amount: 0, obligations: 0 });
      }
      const entry = memberMap.get(mid)!;
      entry.amount += outstanding;
      entry.obligations++;
    }

    return Array.from(memberMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [allObligations]);

  // Collection by contribution type
  const collectionByType = useMemo(() => {
    const obligations = allObligations || [];
    const typeMap = new Map<string, { name: string; collected: number; target: number }>();

    for (const obl of obligations) {
      const ct = obl.contribution_type as { id: string; name: string } | null;
      const typeId = ct?.id || "unknown";
      if (!typeMap.has(typeId)) {
        typeMap.set(typeId, { name: ct?.name || "Unknown", collected: 0, target: 0 });
      }
      const entry = typeMap.get(typeId)!;
      entry.target += Number(obl.amount);
      entry.collected += Number(obl.amount_paid);
    }

    return Array.from(typeMap.values())
      .map((t) => ({ ...t, rate: t.target > 0 ? Math.round((t.collected / t.target) * 100) : 0 }))
      .sort((a, b) => b.target - a.target);
  }, [allObligations]);

  // Recent payments (top 5)
  const recentPayments = useMemo(() => {
    const payments = allPayments || [];
    return payments.slice(0, 5).map((p) => {
      const membership = p.membership as { id: string; profiles: { full_name: string } | { full_name: string }[] };
      const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
      const ct = p.contribution_type as { id: string; name: string; name_fr?: string } | null;
      const date = (p.recorded_at || p.created_at || "").slice(0, 10);
      const shortDate = date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      return {
        id: p.id,
        name: profile?.full_name || "Unknown",
        type: ct?.name || "Payment",
        amount: Number(p.amount),
        method: p.payment_method || "cash",
        date: shortDate,
      };
    });
  }, [allPayments]);

  const monthOverMonthChange = stats.collectedLastMonth > 0
    ? Math.round(((stats.collectedThisMonth - stats.collectedLastMonth) / stats.collectedLastMonth) * 100)
    : stats.collectedThisMonth > 0 ? 100 : 0;

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) return <AdminGuard><DashboardSkeleton /></AdminGuard>;

  if (isError) return <AdminGuard><ErrorState message="Failed to load financial data." onRetry={() => oblRefetch()} /></AdminGuard>;

  return (
    <AdminGuard><div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("finances.title")}</h1>
        <p className="text-muted-foreground">{t("finances.subtitle")}</p>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subNavItems.map((item) => (
          <Link key={item.key} href={item.href}>
            <Button
              variant={item.key === "finances" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
            >
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finances.collectedThisPeriod")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(stats.collectedThisMonth, currency)}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {monthOverMonthChange >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className={monthOverMonthChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {monthOverMonthChange >= 0 ? "+" : ""}{monthOverMonthChange}%
              </span>
              <span className="text-muted-foreground">{t("finances.vsLastMonth")}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finances.totalOutstanding")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(stats.totalOutstanding, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {topOverdue.length} {t("finances.membersOverdue")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finances.collectionRate")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.collectionRate}%</div>
            <div className="mt-2">
              <Progress value={stats.collectionRate} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finances.paymentsThisMonth")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paymentsThisMonth}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("finances.transactions")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Top Overdue */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Collection Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("finances.monthlyTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value), currency), t("finances.collected")]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {monthlyTrend.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === monthlyTrend.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.3)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Overdue Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("finances.topOverdue")}</CardTitle>
            <Link href="/dashboard/contributions/unpaid">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topOverdue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No overdue members</p>
            ) : (
              <div className="space-y-3">
                {topOverdue.map((member, i) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">
                      {i + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {member.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {member.obligations} {t("finances.items")}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-destructive">
                      {formatCurrency(member.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Collection by Type + Recent Payments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Collection by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("finances.byType")}</CardTitle>
          </CardHeader>
          <CardContent>
            {collectionByType.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No contribution types yet</p>
            ) : (
              <div className="space-y-4">
                {collectionByType.map((type) => (
                  <div key={type.name} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{type.name}</span>
                      <span className="text-muted-foreground">{type.rate}%</span>
                    </div>
                    <Progress value={type.rate} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(type.collected, currency)} {t("finances.collected")}</span>
                      <span>{t("finances.target")}: {formatCurrency(type.target, currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("finances.recentPayments")}</CardTitle>
            <Link href="/dashboard/contributions/history">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {payment.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{payment.name}</p>
                      <p className="text-xs text-muted-foreground">{payment.type} {payment.method && `\u2022 ${payment.method}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        +{formatCurrency(payment.amount, currency)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{payment.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div></AdminGuard>
  );
}
