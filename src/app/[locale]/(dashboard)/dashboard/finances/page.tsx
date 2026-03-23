"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Users,
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

// Mock data for financial dashboard
const stats = {
  totalCollected: 7835000,
  totalOutstanding: 445000,
  collectionRate: 95,
  paymentsThisMonth: 28,
  collectedThisMonth: 485000,
  collectedLastMonth: 420000,
};

const monthlyTrend = [
  { month: "Oct", amount: 380000 },
  { month: "Nov", amount: 425000 },
  { month: "Dec", amount: 510000 },
  { month: "Jan", amount: 890000 },
  { month: "Feb", amount: 420000 },
  { month: "Mar", amount: 485000 },
];

const topOverdue = [
  { id: "8", name: "Thomas Nkeng", amount: 165000, currency: "XAF", obligations: 4 },
  { id: "6", name: "Patrick Njoya", amount: 85000, currency: "XAF", obligations: 3 },
  { id: "11", name: "Samuel Fon", amount: 80000, currency: "XAF", obligations: 3 },
  { id: "4", name: "Emmanuel Tabi", amount: 50000, currency: "XAF", obligations: 1 },
  { id: "10", name: "Angeline Tchatchouang", amount: 40000, currency: "XAF", obligations: 1 },
];

const collectionByType = [
  { name: "Monthly Contribution", collected: 4935000, target: 6015000, rate: 82 },
  { name: "Annual Dues", collected: 1850000, target: 2350000, rate: 79 },
  { name: "Building Fund Levy", collected: 2300000, target: 4700000, rate: 49 },
  { name: "Quarterly Social Fund", collected: 750000, target: 1125000, rate: 67 },
];

const recentPayments = [
  { id: "1", name: "Jean-Pierre Kamga", type: "Monthly", amount: 15000, currency: "XAF", method: "Cash", date: "Mar 20" },
  { id: "2", name: "Sylvie Mbarga", type: "Monthly", amount: 15000, currency: "XAF", method: "MoMo", date: "Mar 19" },
  { id: "3", name: "Emmanuel Tabi", type: "Monthly", amount: 15000, currency: "XAF", method: "Bank", date: "Mar 18" },
  { id: "4", name: "Beatrice Ngono", type: "Annual", amount: 50000, currency: "XAF", method: "MoMo", date: "Mar 15" },
  { id: "5", name: "Grace Eteki", type: "Building", amount: 100000, currency: "XAF", method: "Bank", date: "Mar 12" },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function formatCompact(amount: number) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
}

export default function FinancesPage() {
  const t = useTranslations();

  const monthOverMonthChange = Math.round(
    ((stats.collectedThisMonth - stats.collectedLastMonth) / stats.collectedLastMonth) * 100
  );

  const subNavItems = [
    { key: "types", href: "/dashboard/contributions", icon: HandCoins, label: t("contributions.types") },
    { key: "record", href: "/dashboard/contributions/record", icon: CreditCard, label: t("contributions.recordPayment") },
    { key: "history", href: "/dashboard/contributions/history", icon: History, label: t("contributions.history") },
    { key: "matrix", href: "/dashboard/contributions/matrix", icon: Grid3X3, label: t("contributions.matrix") },
    { key: "unpaid", href: "/dashboard/contributions/unpaid", icon: AlertTriangle, label: t("contributions.unpaid") },
    { key: "finances", href: "/dashboard/finances", icon: BarChart3, label: t("contributions.financeDashboard") },
  ];

  return (
    <div className="space-y-6">
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
              {formatCurrency(stats.collectedThisMonth, "XAF")}
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
              {formatCurrency(stats.totalOutstanding, "XAF")}
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
                    formatter={(value) => [formatCurrency(Number(value), "XAF"), t("finances.collected")]}
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
                    {formatCurrency(member.amount, member.currency)}
                  </span>
                </div>
              ))}
            </div>
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
            <div className="space-y-4">
              {collectionByType.map((type) => (
                <div key={type.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{type.name}</span>
                    <span className="text-muted-foreground">{type.rate}%</span>
                  </div>
                  <Progress value={type.rate} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(type.collected, "XAF")} {t("finances.collected")}</span>
                    <span>{t("finances.target")}: {formatCurrency(type.target, "XAF")}</span>
                  </div>
                </div>
              ))}
            </div>
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
                    <p className="text-xs text-muted-foreground">{payment.type} • {payment.method}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary">
                      +{formatCurrency(payment.amount, payment.currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{payment.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
