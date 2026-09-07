"use client";
import { formatAmount } from "@/lib/currencies";


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
import dynamic from "next/dynamic";
import { useObligations, usePayments } from "@/lib/hooks/use-supabase-query";

// WS4 (B11): lazy-load the recharts monthly-trend chart so recharts (~74KB gzip)
// stays off the finances first-paint critical path on low-bandwidth links.
const MonthlyTrendChart = dynamic(() => import("@/components/charts/monthly-trend-chart"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-md bg-muted" />,
});
import { useGroup } from "@/lib/group-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DashboardSkeleton, ErrorState } from "@/components/ui/page-skeleton";
import { RequirePermission } from "@/components/ui/permission-gate";
import { getMemberName } from "@/lib/get-member-name";
import { MoneyOverview } from "@/components/finances/money-overview";
import { invalidateFinancialQueries } from "@/lib/financial-query-keys";
import {
  confirmedPaidByType,
  computeMoneyFiguresByCurrency,
  computeObligationStates,
  isConfirmedPayment,
  num,
  type MoneyObligation,
  type MoneyPayment,
} from "@/lib/money";
import { bucketCurrencyAmounts } from "@/lib/currency-buckets";


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

      // Overdue installments — group-scoped via the loans!inner join.
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

export default function FinancesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { currentGroup, groupId, isAdmin } = useGroup();
  const queryClient = useQueryClient();
  const currency = currentGroup?.currency || "XAF";
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const { data: allObligations, isLoading: oblLoading, isError: oblError, refetch: oblRefetch } = useObligations();
  const { data: allPayments, isLoading: payLoading, isError: payError, refetch: payRefetch } = usePayments("all");
  const { data: fineStats } = useFineStats(groupId || null);
  const { data: loanStats } = useLoanStats(groupId || null);

  const isLoading = oblLoading || payLoading;
  const isError = oblError || payError;

  // Compute stats from real data
  const stats = useMemo(() => {
    const obligations = allObligations || [];
    const payments = allPayments || [];

    const moneyByCurrency = computeMoneyFiguresByCurrency(obligations, payments);
    const isConfirmed = (status: unknown) => isConfirmedPayment(status as string | null);

    // This month's payments
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    let paymentsThisMonth = 0;
    const thisMonthPayments: typeof payments = [];
    const lastMonthPayments: typeof payments = [];

    for (const p of payments) {
      if (!isConfirmed((p as Record<string, unknown>).status)) continue;
      const pMonth = (p.recorded_at || p.created_at || "").slice(0, 7);
      if (pMonth === thisMonthKey) {
        thisMonthPayments.push(p);
        paymentsThisMonth++;
      } else if (pMonth === lastMonthKey) {
        lastMonthPayments.push(p);
      }
    }

    return {
      moneyByCurrency,
      collectedThisMonth: bucketCurrencyAmounts(thisMonthPayments, (p) => Number(p.amount), (p) => p.currency),
      collectedLastMonth: bucketCurrencyAmounts(lastMonthPayments, (p) => Number(p.amount), (p) => p.currency),
      paymentsThisMonth,
    };
  }, [allObligations, allPayments]);

  // Monthly trend: group payments by month (last 6 months)
  const monthlyTrend = useMemo(() => {
    const payments = allPayments || [];
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short" }),
      });
    }

    const monthCurrencyMap = new Map<string, Map<string, number>>();

    for (const p of payments) {
      const status = ((p as Record<string, unknown>).status as string) || "confirmed";
      if (!isConfirmedPayment(status)) continue;
      const pMonth = (p.recorded_at || p.created_at || "").slice(0, 7);
      if (!months.some((month) => month.key === pMonth)) continue;
      const rowCurrency = String(p.currency || currency).toUpperCase();
      if (!monthCurrencyMap.has(rowCurrency)) monthCurrencyMap.set(rowCurrency, new Map());
      const bucket = monthCurrencyMap.get(rowCurrency)!;
      bucket.set(pMonth, (bucket.get(pMonth) || 0) + Number(p.amount));
    }

    return [...monthCurrencyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rowCurrency, values]) => ({
      currency: rowCurrency,
      data: months.map((m) => ({ month: m.label, amount: values.get(m.key) || 0 })),
    }));
  }, [allPayments, locale, currency]);

  // Top members who owe: outstanding is computed PER MEMBER from CONFIRMED
  // payments (member expected − member confirmed). Per-member (not per-obligation)
  // because most dues payments are recorded without an obligation_id; keying on
  // obligation_id would miss them and falsely show paid-up members as owing.
  const topOverdue = useMemo(() => {
    const obligations = (allObligations || []) as unknown as (MoneyObligation & Record<string, unknown>)[];
    const payments = (allPayments || []) as unknown as MoneyPayment[];
    const states = computeObligationStates(obligations, payments);
    const memberAgg = new Map<string, { id: string; name: string; currency: string; amount: number; obligations: number }>();
    for (const obl of obligations) {
      const state = states.get(obl.id);
      if (!state?.isOverdue) continue;
      const mid = obl.membership_id || obl.id;
      const rowCurrency = String(obl.currency || currency).toUpperCase();
      const key = `${mid}:${rowCurrency}`;
      if (!memberAgg.has(key)) memberAgg.set(key, {
        id: mid, name: getMemberName(obl.membership as Record<string, unknown>), currency: rowCurrency, amount: 0, obligations: 0,
      });
      const entry = memberAgg.get(key)!;
      entry.amount += state.remaining;
      entry.obligations++;
    }
    return Array.from(memberAgg.values())
      .filter((m) => m.amount > 0)
      .sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount)
      .slice(0, 5);
  }, [allObligations, allPayments, currency]);

  // Collection by contribution type. Per-type "collected" = Σ CONFIRMED payments
  // carrying that contribution_type_id (most dues payments have no obligation_id,
  // so attribute by type — not the polluted amount_paid column, not obligation
  // links); per-type "target" (expected) excludes waived obligations.
  const collectionByType = useMemo(() => {
    const obligations = (allObligations || []) as unknown as (MoneyObligation & Record<string, unknown>)[];
    const payments = (allPayments || []) as unknown as MoneyPayment[];
    const collectedByType = confirmedPaidByType(payments, obligations);
    const typeMap = new Map<string, { id: string; name: string; currency: string; collected: number; target: number }>();

    for (const obl of obligations) {
      const isWaived = obl.status === "waived";
      const ct = obl.contribution_type as { id: string; name: string } | null;
      const typeId = ct?.id || "unknown";
      if (!typeMap.has(typeId)) {
        typeMap.set(typeId, {
          id: typeId,
          name: ct?.name || t("common.unknown"),
          currency: String(obl.currency || currency).toUpperCase(),
          collected: collectedByType.get(typeId) || 0,
          target: 0,
        });
      }
      const entry = typeMap.get(typeId)!;
      // Waived money is neither owed (target) nor counted as collected.
      if (isWaived) continue;
      entry.target += num(obl.amount);
    }

    return Array.from(typeMap.values())
      .map((t) => ({ ...t, rate: t.target > 0 ? Math.round((t.collected / t.target) * 100) : 0 }))
      .sort((a, b) => a.currency.localeCompare(b.currency) || b.target - a.target);
  }, [allObligations, allPayments, currency, t]);

  // Recent payments (top 5)
  const recentPayments = useMemo(() => {
    const payments = allPayments || [];
    return payments.filter((p) => isConfirmedPayment(p.status)).slice(0, 5).map((p) => {
      const ct = p.contribution_type as { id: string; name: string; name_fr?: string } | null;
      const date = (p.recorded_at || p.created_at || "").slice(0, 10);
      const shortDate = date ? new Date(`${date}T00:00:00`).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric" }) : "";
      return {
        id: p.id,
        name: getMemberName(p.membership as Record<string, unknown>),
        type: ct?.name || t("contributions.paymentFallback"),
        amount: Number(p.amount),
        currency: String(p.currency || currency).toUpperCase(),
        method: p.payment_method || "cash",
        date: shortDate,
      };
    });
  }, [allPayments, currency, locale, t]);

  const monthOverMonthChanges = stats.collectedThisMonth.map((bucket) => {
    const prior = stats.collectedLastMonth.find((item) => item.currency === bucket.currency)?.amount || 0;
    return { ...bucket, change: prior > 0 ? Math.round(((bucket.amount - prior) / prior) * 100) : bucket.amount > 0 ? 100 : 0 };
  });

  async function handleSyncPayments() {
    if (!groupId || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      await invalidateFinancialQueries(queryClient, groupId);
    } catch (err) {
      setSyncResult(t("contributions.syncError", { message: (err as Error).message }));
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

  if (isError) return <RequirePermission anyOf={["finances.manage", "finances.view"]}><ErrorState message={t("common.error")} onRetry={() => { void oblRefetch(); void payRefetch(); }} /></RequirePermission>;

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
            {t("common.refresh")}
          </Button>
          {syncResult && <span className="text-xs text-muted-foreground">{syncResult}</span>}
        </div>
      )}

      {/* Collection overview — money command center */}
      <MoneyOverview />

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
            <div className="space-y-2">
              {monthOverMonthChanges.map((bucket) => <div key={bucket.currency}>
                <div className="text-xl font-bold text-primary">{formatAmount(bucket.amount, bucket.currency)}</div>
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {bucket.change >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                  <span className={bucket.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{bucket.change >= 0 ? "+" : ""}{bucket.change}%</span>
                  <span className="text-muted-foreground">{t("finances.vsLastMonth")}</span>
                </div>
              </div>)}
              {monthOverMonthChanges.length === 0 && <div className="text-2xl font-bold text-primary">{formatAmount(0, currency)}</div>}
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
            <div className="space-y-1 text-xl font-bold text-destructive">
              {stats.moneyByCurrency.map((bucket) => <div key={bucket.currency}>{formatAmount(bucket.outstanding, bucket.currency)}</div>)}
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
            <div className="space-y-2">
              {stats.moneyByCurrency.map((bucket) => {
                const rate = bucket.expected > 0 ? Math.round(((bucket.expected - bucket.outstanding) / bucket.expected) * 100) : 0;
                return <div key={bucket.currency}><div className="flex justify-between text-sm font-semibold"><span>{bucket.currency}</span><span>{rate}%</span></div><Progress value={rate} /></div>;
              })}
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
            <div className="space-y-5">
              {monthlyTrend.map((series) => <div key={series.currency}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{series.currency}</p>
                <div className="h-[220px] sm:h-[260px]"><MonthlyTrendChart data={series.data} currency={series.currency} collectedLabel={t("finances.collected")} /></div>
              </div>)}
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
                      <Link href={`/dashboard/members/${member.id}`} className="block truncate text-sm font-medium hover:underline">{member.name}</Link>
                      <p className="text-[10px] text-muted-foreground">
                        {member.obligations} {t("finances.items")}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-destructive">
                      {formatAmount(member.amount, member.currency)}
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
                  <div key={type.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Link href={`/dashboard/contributions/${type.id}/report`} className="min-w-0 break-words font-medium hover:underline">{type.name}</Link>
                      <span className="text-muted-foreground">{type.rate}%</span>
                    </div>
                    <Progress value={type.rate} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                       <span>{formatAmount(type.collected, type.currency)} {t("finances.collected")}</span>
                       <span>{t("finances.target")}: {formatAmount(type.target, type.currency)}</span>
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
                         +{formatAmount(payment.amount, payment.currency)}
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
