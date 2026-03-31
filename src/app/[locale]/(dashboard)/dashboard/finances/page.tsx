"use client";
import { formatAmount } from "@/lib/currencies";
import { getDateLocale } from "@/lib/date-utils";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  RefreshCw,
  Loader2,
  Landmark,
  Banknote,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { getMemberName } from "@/lib/get-member-name";


function useFineStats(groupId: string | null) {
  return useQuery({
    queryKey: ["fine-stats-finance", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data: allFines } = await supabase
        .from("fines")
        .select("amount, status, paid_amount, paid_at")
        .eq("group_id", groupId);

      if (!allFines || allFines.length === 0) return null;

      const outstanding = allFines
        .filter((f) => f.status === "pending")
        .reduce((sum, f) => sum + Number(f.amount || 0), 0);

      const thisYear = new Date().getFullYear();
      const collectedYear = allFines
        .filter((f) => f.status === "paid" && f.paid_at && new Date(f.paid_at).getFullYear() === thisYear)
        .reduce((sum, f) => sum + Number(f.paid_amount || f.amount || 0), 0);

      return { outstanding, collectedYear };
    },
    enabled: !!groupId,
  });
}

function useLoanStats(groupId: string | null) {
  return useQuery({
    queryKey: ["loan-stats-finance", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const supabase = createClient();

      // Active loans (approved/disbursed/repaying) — outstanding
      const { data: activeLoans } = await supabase
        .from("loans")
        .select("total_repayable, total_repaid, amount_approved, disbursed_at, status")
        .eq("group_id", groupId)
        .in("status", ["approved", "disbursed", "repaying"]);

      const outstanding = (activeLoans || []).reduce(
        (sum, l) => sum + (Number(l.total_repayable || 0) - Number(l.total_repaid || 0)), 0
      );

      // Disbursed this year
      const thisYear = new Date().getFullYear();
      const { data: allLoans } = await supabase
        .from("loans")
        .select("amount_approved, disbursed_at, total_repaid, created_at")
        .eq("group_id", groupId);

      const disbursedThisYear = (allLoans || [])
        .filter((l) => l.disbursed_at && new Date(l.disbursed_at).getFullYear() === thisYear)
        .reduce((sum, l) => sum + Number(l.amount_approved || 0), 0);

      const repaidThisYear = (allLoans || [])
        .filter((l) => new Date(l.created_at).getFullYear() === thisYear)
        .reduce((sum, l) => sum + Number(l.total_repaid || 0), 0);

      // Overdue installments count
      const { count } = await supabase
        .from("loan_schedule")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .in("loan_id", (activeLoans || []).map(() => "").length > 0 ? [] : [""]);

      // Better approach: query overdue directly with join
      const { data: overdueInst } = await supabase
        .from("loan_schedule")
        .select("id, loans!inner(group_id)")
        .eq("status", "overdue")
        .eq("loans.group_id", groupId);

      return {
        outstanding,
        disbursedThisYear,
        repaidThisYear,
        overdueCount: (overdueInst || []).length,
        hasLoans: (allLoans || []).length > 0,
      };
    },
    enabled: !!groupId,
  });
}

function formatCompact(amount: number) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
}

export default function FinancesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { currentGroup, groupId, isAdmin } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const { data: allObligations, isLoading: oblLoading, isError: oblError, refetch: oblRefetch } = useObligations();
  const { data: allPayments, isLoading: payLoading, isError: payError } = usePayments(5000);
  const { data: contributionTypes } = useContributionTypes();
  const { data: fineStats } = useFineStats(groupId || null);
  const { data: loanStats } = useLoanStats(groupId || null);

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
        memberMap.set(mid, { name: getMemberName(obl.membership as Record<string, unknown>), amount: 0, obligations: 0 });
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
        typeMap.set(typeId, { name: ct?.name || t("common.unknown"), collected: 0, target: 0 });
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
      const shortDate = date ? new Date(date).toLocaleDateString(getDateLocale(locale), { month: "short", day: "numeric" }) : "";
      return {
        id: p.id,
        name: getMemberName(p.membership as Record<string, unknown>),
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

  async function handleSyncPayments() {
    if (!groupId || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const supabase = createClient();
      // Get all payments for this group
      const { data: payments } = await supabase
        .from("payments")
        .select("id, membership_id, contribution_type_id, amount, group_id, recorded_at")
        .eq("group_id", groupId);

      if (!payments || payments.length === 0) {
        setSyncResult(t("finances.noPaymentsToSync"));
        return;
      }

      // Group payments by member + contribution type
      const paymentMap = new Map<string, number>();
      for (const p of payments) {
        if (!p.contribution_type_id) continue;
        const key = `${p.membership_id}__${p.contribution_type_id}`;
        paymentMap.set(key, (paymentMap.get(key) || 0) + Number(p.amount));
      }

      let updated = 0;
      for (const [key, totalPaid] of paymentMap.entries()) {
        const [membershipId, contributionTypeId] = key.split("__");

        // Find matching obligation(s)
        const { data: obligations } = await supabase
          .from("contribution_obligations")
          .select("id, amount, amount_paid")
          .eq("membership_id", membershipId)
          .eq("contribution_type_id", contributionTypeId)
          .eq("group_id", groupId)
          .order("due_date", { ascending: false })
          .limit(1);

        if (obligations && obligations.length > 0) {
          const ob = obligations[0];
          const amountDue = Number(ob.amount) || 0;
          let newStatus: string = "pending";
          if (totalPaid >= amountDue && amountDue > 0) newStatus = "paid";
          else if (totalPaid > 0) newStatus = "partial";

          await supabase
            .from("contribution_obligations")
            .update({ amount_paid: totalPaid, status: newStatus })
            .eq("id", ob.id);
          updated++;
        }
        // Small delay to not overwhelm Supabase
        await new Promise((r) => setTimeout(r, 30));
      }

      setSyncResult(`Synced ${updated} obligations from ${payments.length} payments`);
      queryClient.invalidateQueries({ queryKey: ["obligations"] });
      queryClient.invalidateQueries({ queryKey: ["matrix-data"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["aggregated-feed"] });
    } catch (err) {
      setSyncResult(`Error: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  if (isLoading) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><DashboardSkeleton /></RequirePermission>;

  if (isError) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ErrorState message={t("common.error")} onRetry={() => oblRefetch()} /></RequirePermission>;

  return (
    <RequirePermission anyOf={["finances.manage", "finances.view"]}><div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("finances.title")}</h1>
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

      {/* Sync Payments (admin only) */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleSyncPayments} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            {t("finances.syncPayments")}
          </Button>
          {syncResult && <span className="text-xs text-muted-foreground">{syncResult}</span>}
        </div>
      )}

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
              {formatAmount(stats.collectedThisMonth, currency)}
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
              {formatAmount(stats.totalOutstanding, currency)}
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
                    formatter={(value) => [formatAmount(Number(value), currency), t("finances.collected")]}
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
              <p className="text-sm text-muted-foreground py-4 text-center">{t("finances.noOverdue")}</p>
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
                      {formatAmount(member.amount, currency)}
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
              <p className="text-sm text-muted-foreground py-4 text-center">{t("finances.noTypes")}</p>
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
                      <span>{formatAmount(type.collected, currency)} {t("finances.collected")}</span>
                      <span>{t("finances.target")}: {formatAmount(type.target, currency)}</span>
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
              <p className="text-sm text-muted-foreground py-4 text-center">{t("finances.noPayments")}</p>
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
                        +{formatAmount(payment.amount, currency)}
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

      {/* Fines Overview Section */}
      {fineStats && (
        <>
          <h2 className="text-lg font-semibold mt-2">{t("finances.finesOverview")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.finesOutstanding")}
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {formatAmount(fineStats.outstanding, currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.finesCollectedYear")}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatAmount(fineStats.collectedYear, currency)}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Loan Overview Section (Fix 3) */}
      {loanStats && loanStats.hasLoans && (
        <>
          <h2 className="text-lg font-semibold mt-2">{t("finances.loanOverview")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.loansOutstanding")}
                </CardTitle>
                <Landmark className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {formatAmount(loanStats.outstanding, currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.loansDisbursedYear")}
                </CardTitle>
                <Banknote className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatAmount(loanStats.disbursedThisYear, currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.loansRepaidYear")}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatAmount(loanStats.repaidThisYear, currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("finances.loansOverdueCount")}
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loanStats.overdueCount}</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div></RequirePermission>
  );
}
