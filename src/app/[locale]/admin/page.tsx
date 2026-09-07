"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { formatAmount } from "@/lib/currencies";
import { bucketCurrencyAmounts, formatCurrencyBuckets } from "@/lib/currency-buckets";
import { isConfirmedPayment } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useAdminQuery } from "@/lib/hooks/use-admin-query";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  Users,
  CreditCard,
  DollarSign,
  Clock,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Eye,
  Megaphone,
  Plug,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
}

interface PaymentRow {
  id: string;
  amount: number;
  recorded_at: string;
  payment_method: string;
  currency: string;
  status?: string | null;
}

interface RecentPaymentRow {
  id: string;
  amount: number;
  currency: string;
  recorded_at: string;
  group_id: string;
  status?: string | null;
  memberships: {
    display_name: string | null;
    profiles: { full_name: string | null } | null;
  } | null;
}

interface PlatformStats {
  active_groups: number;
  total_groups: number;
  total_users: number;
  payments_30d: number;
  revenue_30d: number;
  payments_prev_30d: number;
  revenue_prev_30d: number;
  active_subscriptions: number;
  pending_payments: number;
  events_30d: number;
  prev_users: number;
  prev_groups: number;
  vouchers_active: number;
  vouchers_redeemed: number;
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"];

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        {"\u2014"}
      </span>
    );
  }
  const isUp = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-xs ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}
      {value}%
    </span>
  );
}

export default function AdminDashboardPage() {
  const [renderedAt] = useState(() => Date.now());
  const t = useTranslations("admin");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  const d30 = useMemo(() => new Date(renderedAt - 30 * 24 * 60 * 60 * 1000).toISOString(), [renderedAt]);
  const d6mo = useMemo(() => new Date(renderedAt - 180 * 24 * 60 * 60 * 1000).toISOString(), [renderedAt]);

  // Fetch table data via admin API (service role, bypasses RLS)
  const { results: adminResults, loading: adminLoading } = useAdminQuery([
    {
      key: "payments30d",
      table: "payments",
      select: "id, amount, recorded_at, payment_method, currency, status",
      filters: [{ column: "recorded_at", op: "gte", value: d30 }],
    },
    {
      key: "payments6mo",
      table: "payments",
      select: "amount, currency, status, recorded_at",
      filters: [{ column: "recorded_at", op: "gte", value: d6mo }],
    },
    {
      key: "recentGroups",
      table: "groups",
      select: "id, name, created_at, is_active",
      order: { column: "created_at", ascending: false },
      limit: 5,
    },
    {
      key: "recentPayments",
      table: "payments",
      select: "id, amount, currency, status, recorded_at, group_id, memberships!inner(display_name, profiles!memberships_user_id_fkey(full_name))",
      order: { column: "recorded_at", ascending: false },
      limit: 10,
    },
    {
      key: "allGroups",
      table: "groups",
      select: "id, name, created_at, is_active",
    },
  ]);

  const payments30d = useMemo(
    () => (adminResults.payments30d?.data as PaymentRow[]) ?? [],
    [adminResults.payments30d?.data],
  );
  const payments6mo = useMemo(() => (adminResults.payments6mo?.data as {
    amount: number;
    currency: string;
    status?: string | null;
    recorded_at: string;
  }[]) ?? [], [adminResults.payments6mo?.data]);
  const recentGroups = useMemo(
    () => (adminResults.recentGroups?.data as GroupRow[]) ?? [],
    [adminResults.recentGroups?.data],
  );
  const recentPayments = useMemo(
    () => (adminResults.recentPayments?.data as unknown as RecentPaymentRow[]) ?? [],
    [adminResults.recentPayments?.data],
  );
  const groups = useMemo(
    () => (adminResults.allGroups?.data as GroupRow[]) ?? [],
    [adminResults.allGroups?.data],
  );
  const loading = statsLoading || adminLoading;

  // Fetch platform stats via SECURITY DEFINER RPC (summary cards)
  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      const statsRes = await supabase.rpc("get_platform_stats");
      if (statsRes.data && !statsRes.data.error) {
        setStats(statsRes.data as unknown as PlatformStats);
      }
      setStatsLoading(false);
    }
    fetchStats();
  }, []);

  // Use RPC stats for summary values (accurate platform-wide counts)
  const activeGroupCount = stats?.active_groups ?? 0;
  const profileCount = stats?.total_users ?? 0;
  const payments30dCount = stats?.payments_30d ?? 0;
  const revenue30d = useMemo(() => bucketCurrencyAmounts(
    payments30d.filter((payment) => isConfirmedPayment(payment.status)),
    (payment) => Number(payment.amount),
    (payment) => payment.currency,
  ), [payments30d]);
  const pendingCount = stats?.pending_payments ?? 0;
  const activeSubscriptions = stats?.active_subscriptions ?? 0;

  function computeTrend(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null;
    return Math.round(((current - previous) / previous) * 100);
  }

  const groupTrend = computeTrend(
    activeGroupCount,
    stats?.prev_groups ?? 0
  );
  const userTrend = computeTrend(profileCount, stats?.prev_users ?? 0);
  const paymentCountTrend = computeTrend(
    payments30dCount,
    stats?.payments_prev_30d ?? 0
  );
  // Chart data: Revenue trend (6 months)
  const revenueChartData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString(dateLocale, { month: "short" }) });
    }
    const values = new Map<string, Map<string, number>>();
    for (const p of payments6mo) {
      if (!isConfirmedPayment(p.status)) continue;
      const d = new Date(p.recorded_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.some((month) => month.key === key)) continue;
      const currency = String(p.currency || "").toUpperCase();
      if (!currency) continue;
      if (!values.has(currency)) values.set(currency, new Map());
      const bucket = values.get(currency)!;
      bucket.set(key, (bucket.get(key) || 0) + (Number(p.amount) || 0));
    }
    return [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amounts]) => ({
      currency,
      data: months.map((month) => ({ name: month.label, value: amounts.get(month.key) || 0 })),
    }));
  }, [payments6mo, dateLocale]);

  // Chart data: Transaction status (by payment method)
  const txnMethodData = useMemo(() => {
    const methodMap: Record<string, string> = {
      cash: "cash",
      mobile_money: "mobileMoney",
      bank_transfer: "bankTransfer",
      online: "online",
    };
    const counts: Record<string, number> = {};
    for (const p of payments30d) {
      const key = methodMap[p.payment_method] || p.payment_method;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([key, value]) => ({
      name: t(key as Parameters<typeof t>[0]),
      value,
    }));
  }, [payments30d, t]);

  // Risk: payments > 5x average
  const riskCount = useMemo(() => {
    if (payments30d.length === 0) return 0;
    const confirmed = payments30d.filter((payment) => isConfirmedPayment(payment.status));
    const byCurrency = new Map<string, PaymentRow[]>();
    for (const payment of confirmed) {
      const currency = String(payment.currency || "").toUpperCase();
      if (!byCurrency.has(currency)) byCurrency.set(currency, []);
      byCurrency.get(currency)!.push(payment);
    }
    return [...byCurrency.values()].reduce((count, rows) => {
      const avg = rows.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) / rows.length;
      return count + rows.filter((payment) => Number(payment.amount) > avg * 5).length;
    }, 0);
  }, [payments30d]);

  // Top groups by payment
  const topGroupsData = useMemo(() => {
    const groupTotals: Record<string, { name: string; currency: string; total: number }> = {};
    const groupNames: Record<string, string> = {};
    for (const g of groups) {
      groupNames[g.id] = g.name;
    }
    for (const p of recentPayments.filter((payment) => isConfirmedPayment(payment.status))) {
      const gid = p.group_id;
      const currency = String(p.currency || "").toUpperCase();
      const key = `${gid}:${currency}`;
      if (!groupTotals[key]) {
        groupTotals[key] = {
          name: groupNames[gid] || t("noGroupName"),
          currency,
          total: 0,
        };
      }
      groupTotals[key].total += Number(p.amount) || 0;
    }
    const byCurrency = new Map<string, typeof groupTotals[string][]>();
    for (const row of Object.values(groupTotals)) {
      if (!byCurrency.has(row.currency)) byCurrency.set(row.currency, []);
      byCurrency.get(row.currency)!.push(row);
    }
    return [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, rows]) => ({
      currency, rows: rows.sort((a, b) => b.total - a.total).slice(0, 5),
    }));
  }, [recentPayments, groups, t]);

  const recentConfirmedPayments = useMemo(
    () => recentPayments.filter((payment) => isConfirmedPayment(payment.status)),
    [recentPayments],
  );

  // Relative time
  function relativeTime(dateStr: string): string {
    const diff = renderedAt - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60)
      return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
      return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function getPayerName(p: RecentPaymentRow): string {
    if (p.memberships?.display_name) return p.memberships.display_name;
    if (p.memberships?.profiles?.full_name)
      return p.memberships.profiles.full_name;
    return "\u2014";
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">
            {t("dashboard")}
          </h1>
          <p className="text-muted-foreground">{t("dashboardSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/subscriptions"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("addPlan")}
          </Link>
          <Link
            href="/admin/transactions"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Eye className="mr-1.5 h-4 w-4" />
            {t("viewTransactions")}
          </Link>
          <Link
            href="/admin/content"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Megaphone className="mr-1.5 h-4 w-4" />
            {t("announcements")}
          </Link>
          <Link
            href="/admin/integrations"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Plug className="mr-1.5 h-4 w-4" />
            {t("integrations")}
          </Link>
        </div>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Active Groups */}
        <Link href="/admin/groups" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("activeGroups")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">{activeGroupCount}</p>
                  <TrendBadge value={groupTrend} />
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Total Users */}
        <Link href="/admin/users" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("totalUsers")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">{profileCount}</p>
                  <TrendBadge value={userTrend} />
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Payments 30d */}
        <Link href="/admin/transactions" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("payments30d")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">
                    {payments30dCount}
                  </p>
                  <TrendBadge value={paymentCountTrend} />
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Revenue 30d */}
        <Link href="/admin/reports/financial" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("revenue30d")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <div className="mt-1 space-y-0.5 text-xl font-bold">
                    {formatCurrencyBuckets(revenue30d).map((value) => <p key={value}>{value}</p>)}
                    {revenue30d.length === 0 && <p>—</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Pending Payments */}
        <Link href="/admin/transactions" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("pendingTxns")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <Clock className="h-4 w-4 text-slate-500" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">{pendingCount}</p>
                  <span className="text-xs text-muted-foreground">
                    {t("pendingPaymentsLabel")}
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Active Subscriptions */}
        <Link href="/admin/plans" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md h-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("activeSubscriptions")}
                </p>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold">{activeSubscriptions}</p>
                  <span className="text-xs text-muted-foreground">
                    {t("activeVouchersLabel", { count: stats?.vouchers_active ?? 0 })}
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Two-Column Chart Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Trend AreaChart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("revenueTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : revenueChartData.length === 0 || revenueChartData.every((series) => series.data.every((item) => item.value === 0)) ? (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("noDataYet")}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {revenueChartData.map((series) => <div key={series.currency}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{series.currency}</p>
                  <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={series.data}>
                  <defs>
                    <linearGradient
                      id="emeraldGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#10b981"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    fill="url(#emeraldGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
                  </ResponsiveContainer>
                </div>)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction Status PieChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("transactionStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : txnMethodData.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("noDataYet")}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={txnMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {txnMethodData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Three-Column Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Logins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("recentLogins")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">
                {t("loginTrackingNote")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Groups */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {t("recentGroupsLabel")}
            </CardTitle>
            <Link
              href="/admin/groups"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
            ) : (
              <div className="space-y-3">
                {recentGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {(g.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(g.created_at)}
                      </p>
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
            <CardTitle className="text-base">
              {t("recentPaymentsLabel")}
            </CardTitle>
            <Link
              href="/admin/transactions"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentConfirmedPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noDataYet")}
              </p>
            ) : (
              <div className="space-y-3">
                {recentConfirmedPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {getPayerName(p)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(p.recorded_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold">
                        {formatAmount(p.amount, p.currency)}
                      </span>
                      <Badge
                        variant="default"
                        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"
                      >
                        {t("paid")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("riskAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : riskCount > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm">
                  {t("highValuePayments", { count: riskCount })}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {t("noAnomalies")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Groups by Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              {t("topGroupsByPayments")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : topGroupsData.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("noDataYet")}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {topGroupsData.map((series) => <div key={series.currency}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{series.currency}</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={series.rows}
                  layout="vertical"
                  margin={{ left: 0, right: 12 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis type="number" className="text-xs" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
                </div>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
