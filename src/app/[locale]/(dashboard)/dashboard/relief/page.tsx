"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Users,
  DollarSign,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  PieChart,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";

const stats = {
  activePlans: 3,
  enrolledMembers: 42,
  fundBalance: 1850000,
  ytdPayouts: 650000,
  pendingClaims: 2,
};

const recentClaims = [
  { id: "1", member: "Bernadette Atangana", eventType: "death", plan: "Bereavement Fund", amount: 250000, status: "approved" as const, date: "2026-03-15" },
  { id: "2", member: "Georges Tchinda", eventType: "illness", plan: "Health Emergency Fund", amount: 150000, status: "reviewing" as const, date: "2026-03-18" },
  { id: "3", member: "Hélène Njike", eventType: "childbirth", plan: "Life Events Fund", amount: 100000, status: "submitted" as const, date: "2026-03-20" },
  { id: "4", member: "Paul Ngoumou", eventType: "wedding", plan: "Life Events Fund", amount: 100000, status: "approved" as const, date: "2026-02-10" },
  { id: "5", member: "Rosalie Edimo", eventType: "illness", plan: "Health Emergency Fund", amount: 150000, status: "denied" as const, date: "2026-01-22" },
];

const plans = [
  { name: "Bereavement Fund", enrolled: 45, balance: 950000, color: "bg-purple-500" },
  { name: "Health Emergency", enrolled: 42, balance: 580000, color: "bg-blue-500" },
  { name: "Life Events Fund", enrolled: 38, balance: 320000, color: "bg-emerald-500" },
];

const claimStatusConfig = {
  submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  reviewing: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertCircle },
  approved: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "XAF", minimumFractionDigits: 0 }).format(amount);
}

export default function ReliefDashboardPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("relief.dashboard")}</h1>
          <p className="text-muted-foreground">{t("relief.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/relief/plans">
            <Button variant="outline"><FileText className="mr-2 h-4 w-4" />{t("relief.plans")}</Button>
          </Link>
          <Link href="/dashboard/relief/claims">
            <Button><AlertCircle className="mr-2 h-4 w-4" />{t("relief.claims")}</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("relief.activePlans")}</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activePlans}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("relief.enrolledMembers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.enrolledMembers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("relief.totalFundBalance")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatCurrency(stats.fundBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("relief.pendingClaims")}</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.pendingClaims}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Enrollment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("relief.enrollmentBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plans.map((plan) => (
                <div key={plan.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-muted-foreground">{plan.enrolled} {t("relief.enrolledMembers").toLowerCase()}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="flex-1 h-3 rounded-full bg-muted">
                      <div className={`h-3 rounded-full ${plan.color}`} style={{ width: `${(plan.enrolled / 47) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-primary">{formatCurrency(plan.balance)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{t("relief.ytdPayouts")}</span>
                <span className="text-destructive">{formatCurrency(stats.ytdPayouts)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Claims */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("relief.recentClaims")}</CardTitle>
            <Link href="/dashboard/relief/claims">
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                {t("common.viewAll")}<ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentClaims.map((claim) => {
                const config = claimStatusConfig[claim.status];
                const StatusIcon = config.icon;
                return (
                  <div key={claim.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{claim.member}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`relief.eventTypes.${claim.eventType}`)} · {claim.plan} · {claim.date}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(claim.amount)}</p>
                      <Badge className={config.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {t(`relief.claimStatus.${claim.status}`)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
